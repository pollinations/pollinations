// Cache-Control for R2-backed responses (generated text, image, audio, video,
// and media uploads). max-age matches the 30-day R2 lifecycle. `immutable` is
// intentionally omitted so caches can revalidate once R2 deletes the object —
// otherwise clients can serve stale entries pointing at URLs that no longer
// resolve.
export const R2_CACHE_CONTROL = "public, max-age=2592000";
