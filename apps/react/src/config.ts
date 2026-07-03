// Publishable key for this showcase (pk_* is safe to commit).
// Created via `polli keys create --type publishable` with redirect URIs
// http://localhost:5173 and https://react.pollinations.ai.
export const APP_KEY = "pk_kZRl8saq8s2h9ome";

// Point the catalog at a local gen worker in dev (VITE_GEN_BASE_URL=http://localhost:8788).
// Unset falls back to the SDK default (production gen.pollinations.ai).
export const GEN_BASE_URL = import.meta.env.VITE_GEN_BASE_URL || undefined;
