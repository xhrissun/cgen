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

// R2 public base URL injected at build time (must be set in frontend .env as VITE_R2_PUBLIC_URL)
const R2_PUBLIC_URL = import.meta.env.VITE_R2_PUBLIC_URL || '';

/**
 * Get a usable URL for a document stored in the DB.
 * document.filename / document.key may be:
 *   (a) a full R2 URL  → https://pub-xxx.r2.dev/documents/file.jpg   ← new uploads (filename/url field)
 *   (b) a R2 key       → documents/file.jpg                           ← stored as key field
 *   (c) a legacy path  → profile-695a150e.jpg                         ← old local data (no slash)
 *
 * For (a): return the R2 URL directly — no auth needed, no backend hop
 * For (b): construct R2 public URL directly using VITE_R2_PUBLIC_URL
 * For (c): proxy through backend (legacy fallback)
 */
export const getDocumentUrl = (filenameOrUrl, userId, token) => {
  if (!filenameOrUrl) return null;

  // (a) Already a full URL — use directly, no backend needed
  if (filenameOrUrl.startsWith('http')) return filenameOrUrl;

  // (b) R2 key — contains a slash, e.g. "documents/file.jpg" or "profile-photos/file.jpg"
  // Build the direct R2 public URL to avoid the double-prefix bug and unnecessary backend hop
  if (filenameOrUrl.includes('/') && R2_PUBLIC_URL) {
    return `${R2_PUBLIC_URL}/${filenameOrUrl}`;
  }

  // (c) Legacy short filename (no slash) — proxy through backend
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