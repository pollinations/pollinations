// The packaged runtime initializes isolated Workers and its local database.
// Use the same readiness budget in Cloudflare and the Linux container proof.
export const STARTUP_TIMEOUT_MS = 120_000;
