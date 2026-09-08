// Cache-Control for immutable R2-backed responses. Generated content is
// content-addressed or deterministic, and unlisted media upload ids are never
// reused, so the URL -> bytes mapping never changes. R2's 30-day lifecycle can
// delete the object without making its URL point at different bytes.
export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

// A generation ID identifies a request, whose result may change after expiry.
export const GENERATED_MEDIA_CACHE_CONTROL =
    "public, max-age=0, must-revalidate";
