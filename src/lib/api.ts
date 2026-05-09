/**
 * API base URL utility.
 * Points directly to the deployed Render backend.
 */
export const API_BASE = import.meta.env.VITE_API_BASE ?? "https://prism-backend-ah6f.onrender.com";

/** Builds a full URL for backend API calls. */
export const apiUrl = (path: string) => `${API_BASE}${path}`;
