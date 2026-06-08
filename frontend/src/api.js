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

/**
 * Get a usable URL for a document stored in the DB.
 * document.filename may be:
 *   (a) a full R2 URL  → https://pub-xxx.r2.dev/profile-photos/file.jpg  ← new uploads
 *   (b) a R2 key       → profile-photos/file.jpg                          ← stored as key
 *   (c) a legacy path  → profile-695a150e.jpg                             ← old local data
 *
 * For (a): return the R2 URL directly — no auth needed
 * For (b)/(c): proxy through backend API
 */
export const getDocumentUrl = (filenameOrUrl, userId, token) => {
  if (!filenameOrUrl) return null;
  // Already a full R2/http URL — use directly
  if (filenameOrUrl.startsWith('http')) return filenameOrUrl;
  // Legacy filename — proxy through backend, MUST use BASE_URL not relative path
  // so it always hits the backend, not the frontend static server
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