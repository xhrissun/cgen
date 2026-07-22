import axios from 'axios';

// In production (Render Static), VITE_API_URL = https://cgen-backend.onrender.com
// In dev, it falls back to empty string so Vite proxy handles /api/... calls
const BASE_URL = import.meta.env.VITE_API_URL || 'https://cgen-backend-docker-build.onrender.com';

// ─── In-Memory GET Cache ──────────────────────────────────────────────────────
// Caches GET responses keyed by full request URL.  Solves the tab-switching
// slowness: every component re-mounts and re-fetches the same endpoints
// (/api/users, /api/contracts, /api/positions, etc.).  With the cache, the
// second+ visits to any tab return instantly from memory.
//
// TTL by resource (conservative — data that changes rarely gets longer TTLs):
//   notifications      20 s  (polled every 30 s anyway)
//   users / contracts  60 s
//   change-logs        30 s
//   positions, salary-grades, clauses, clause-groups,
//   signatories, holidays   5 min  (admin-managed, change infrequently)
//
// Automatic invalidation: any POST / PUT / PATCH / DELETE response clears all
// cached entries whose URL prefix matches the mutated resource, so the user
// always sees their own changes immediately.
//
// Call clearCache() on logout to prevent one user's data leaking to another.

const TTL_MAP = {
  'notifications':   20  * 1000,
  'users':           60  * 1000,
  'contracts':       60  * 1000,
  'change-logs':     30  * 1000,
  'positions':        5  * 60 * 1000,
  'salary-grades':    5  * 60 * 1000,
  'clauses':          5  * 60 * 1000,
  'clause-groups':    5  * 60 * 1000,
  'signatories':      5  * 60 * 1000,
  'holidays':         5  * 60 * 1000,
};
const DEFAULT_TTL = 60 * 1000;

// { cacheKey → { data, expires } }
const _store = new Map();

function resolveTTL(urlPath) {
  for (const [segment, ms] of Object.entries(TTL_MAP)) {
    if (urlPath.includes(`/${segment}`)) return ms;
  }
  return DEFAULT_TTL;
}

function cacheKey(baseURL, urlPath, params) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  return (baseURL || '') + urlPath + qs;
}

function invalidateByPrefix(urlPath) {
  // Extract first path segment after /api/  e.g. /api/positions/123 → 'positions'
  const m = urlPath.match(/\/api\/([^/?]+)/);
  if (!m) return;
  const prefix = `/api/${m[1]}`;
  for (const k of _store.keys()) {
    if (k.includes(prefix)) _store.delete(k);
  }
}

/** Clear entire cache — call on logout */
export function clearCache() {
  _store.clear();
}

/** Force-invalidate a resource prefix, e.g. invalidateCache('contracts') */
export function invalidateCache(prefix) {
  if (!prefix) { _store.clear(); return; }
  for (const k of _store.keys()) {
    if (k.includes(`/api/${prefix}`)) _store.delete(k);
  }
}

// ─── Axios instance ───────────────────────────────────────────────────────────
const _axios = axios.create({ baseURL: BASE_URL });

// Wrap _axios so GET requests go through the cache.
// All other methods pass through and invalidate cache on success.
const api = {
  // ── GET — check cache first, fall back to real request ──
  async get(url, config = {}) {
    // Binary/file downloads (e.g. PDF generation) must never be served from
    // or written to the cache: the cached stub has no `.headers`, which
    // breaks callers that read response.headers['content-disposition'], and
    // a "generate PDF" call should always hit the server fresh anyway.
    const isBinary = config.responseType && config.responseType !== 'json';
    // EODB data (passport photo status, TIN, contract number) can change from
    // a different tab/route (photo upload, contract edit) that doesn't touch
    // '/api/eodb' at all, so cache invalidation-by-prefix never clears it.
    // Always fetch it fresh rather than risk showing/generating an EODB ID
    // with a stale "no photo" or outdated contract number.
    const isEodb = url.includes('/api/eodb');
    if (isBinary || isEodb) {
      return _axios.get(url, config);
    }

    const key = cacheKey(BASE_URL, url, config.params);
    const hit = _store.get(key);
    if (hit && Date.now() < hit.expires) {
      // Return a response-shaped object; callers only ever use .data
      return { data: hit.data, status: 200, headers: {}, _fromCache: true };
    }

    const response = await _axios.get(url, config);
    _store.set(key, { data: response.data, expires: Date.now() + resolveTTL(url) });
    return response;
  },

  // ── Mutating methods — pass through and bust the cache ──
  async post(url, data, config)   { const r = await _axios.post(url, data, config);   invalidateByPrefix(url); return r; },
  async put(url, data, config)    { const r = await _axios.put(url, data, config);    invalidateByPrefix(url); return r; },
  async patch(url, data, config)  { const r = await _axios.patch(url, data, config);  invalidateByPrefix(url); return r; },
  async delete(url, config)       { const r = await _axios.delete(url, config);       invalidateByPrefix(url); return r; },
};

export default api;

// Also export the base URL for use in fetch() calls
export const API_BASE = BASE_URL;

// R2 public base URL injected at build time (optional — set VITE_R2_PUBLIC_URL in frontend .env)
const R2_PUBLIC_URL = import.meta.env.VITE_R2_PUBLIC_URL || '';

/**
 * Get a usable URL for a document/photo stored in the DB.
 * document.filename / document.key / profilePhoto may be:
 *   (a) a full R2 URL  → https://pub-xxx.r2.dev/profile-photos/file.jpg  ← new uploads
 *   (b) a R2 key       → profile-photos/file.jpg                          ← stored as key
 *   (c) a legacy path  → profile-695a150e.jpg                             ← old local data
 *
 * Routing logic:
 *   (a) full URL + VITE_R2_PUBLIC_URL set   → use directly (public bucket)
 *   (a) full URL + no VITE_R2_PUBLIC_URL    → extract key and proxy through /api/users/:id/photo/:key
 *   (b) R2 key  + VITE_R2_PUBLIC_URL set    → build direct R2 URL
 *   (b) R2 key  + no VITE_R2_PUBLIC_URL     → proxy through /api/users/:id/photo/:key
 *   (c) legacy short filename               → proxy through /api/users/:id/documents/:filename
 */
export const getDocumentUrl = (filenameOrUrl, userId, token) => {
  if (!filenameOrUrl) return null;

  if (filenameOrUrl.startsWith('http')) {
    const isPrivateR2 = filenameOrUrl.includes('.r2.cloudflarestorage.com');
    if (isPrivateR2) {
      try {
        const parsed = new URL(filenameOrUrl);
        const parts  = parsed.pathname.replace(/^\//, '').split('/');
        const key    = parts.length > 1 && !parts[0].includes('.') ? parts.slice(1).join('/') : parts.join('/');
        if (key && userId && token)
          return `${BASE_URL}/api/users/${userId}/photo/${key}?token=${token}`;
      } catch (_) {}
    }
    if (R2_PUBLIC_URL) return filenameOrUrl;
    try {
      const parsed = new URL(filenameOrUrl);
      const key    = parsed.pathname.replace(/^\//, '');
      if (key && userId && token)
        return `${BASE_URL}/api/users/${userId}/photo/${key}?token=${token}`;
    } catch (_) {}
    return filenameOrUrl;
  }

  if (filenameOrUrl.includes('/')) {
    if (R2_PUBLIC_URL) return `${R2_PUBLIC_URL}/${filenameOrUrl}`;
    if (userId && token)
      return `${BASE_URL}/api/users/${userId}/photo/${filenameOrUrl}?token=${token}`;
  }

  const t = Date.now();
  const v = Math.random().toString(36).substring(2, 12);
  return `${BASE_URL}/api/users/${userId}/documents/${filenameOrUrl}?token=${token}&t=${t}&v=${v}`;
};

export const openDocument = (filenameOrUrl, userId, token) => {
  const url = getDocumentUrl(filenameOrUrl, userId, token);
  if (url) window.open(url, '_blank');
};