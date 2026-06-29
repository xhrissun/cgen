import axios from 'axios';

// In production (Render Static), VITE_API_URL = https://cgen-backend.onrender.com
// In dev, it falls back to empty string so Vite proxy handles /api/... calls
const BASE_URL = import.meta.env.VITE_API_URL || 'https://cgen-backend-docker-build.onrender.com';

const api = axios.create({
  baseURL: BASE_URL,
});

export default api;

// Also export the base URL for use in fetch() calls
export const API_BASE = BASE_URL;

// R2 public base URL injected at build time (optional — set VITE_R2_PUBLIC_URL in frontend .env)
// When set: photos are served directly from R2 (faster, no backend hop)
// When NOT set: photos are proxied through the backend (works even if bucket is not public)
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

  // (a) Already a full URL
  if (filenameOrUrl.startsWith('http')) {
    // Detect private R2 storage endpoint — browsers cannot access this directly.
    // multer-s3 used to store file.location which pointed to the private endpoint.
    // Extract the key and route through the backend proxy instead.
    const isPrivateR2 = filenameOrUrl.includes('.r2.cloudflarestorage.com');

    if (isPrivateR2) {
      // Extract the key: URL is https://<accountId>.r2.cloudflarestorage.com/<bucket>/<key>
      // or sometimes https://<accountId>.r2.cloudflarestorage.com/<key>
      try {
        const parsed = new URL(filenameOrUrl);
        const parts = parsed.pathname.replace(/^\//, '').split('/');
        // If first segment looks like a bucket name (no extension), strip it
        const key = parts.length > 1 && !parts[0].includes('.') ? parts.slice(1).join('/') : parts.join('/');
        if (key && userId && token) {
          return `${BASE_URL}/api/users/${userId}/photo/${key}?token=${token}`;
        }
      } catch (_) { /* fall through */ }
    }

    // Public URL — if R2_PUBLIC_URL is set, trust it's accessible directly
    if (R2_PUBLIC_URL) return filenameOrUrl;

    // No public URL configured — proxy through backend
    try {
      const parsed = new URL(filenameOrUrl);
      const key = parsed.pathname.replace(/^\//, '');
      if (key && userId && token) {
        return `${BASE_URL}/api/users/${userId}/photo/${key}?token=${token}`;
      }
    } catch (_) { /* fall through */ }

    return filenameOrUrl;
  }

  // (b) R2 key — path contains a slash, e.g. "profile-photos/file.jpg"
  if (filenameOrUrl.includes('/')) {
    if (R2_PUBLIC_URL) {
      // Bucket is public — build direct R2 URL
      return `${R2_PUBLIC_URL}/${filenameOrUrl}`;
    }
    // No public URL — proxy through backend with credentials
    if (userId && token) {
      return `${BASE_URL}/api/users/${userId}/photo/${filenameOrUrl}?token=${token}`;
    }
  }

  // (c) Legacy short filename (no slash) — proxy through existing documents route
  const t = Date.now();
  const v = Math.random().toString(36).substring(2, 12);
  return `${BASE_URL}/api/users/${userId}/documents/${filenameOrUrl}?token=${token}&t=${t}&v=${v}`;
};

/**
 * Open or download a document. Handles both R2 URLs and legacy filenames.
 */
export const openDocument = (filenameOrUrl, userId, token) => {
  const url = getDocumentUrl(filenameOrUrl, userId, token);
  if (url) window.open(url, '_blank');
};