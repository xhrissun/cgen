import axios from 'axios';

// In production (Render Static), VITE_API_URL = https://cgen-backend.onrender.com
// In dev, it falls back to empty string so Vite proxy handles /api/... calls
const BASE_URL = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: BASE_URL,
});

export default api;

// Also export the base URL for use in fetch() calls
export const API_BASE = BASE_URL;