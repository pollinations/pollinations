// Cache-Control for R2-backed responses (generated text, image, audio, video,
// and media uploads). Content is content-addressed or fully deterministic by
// request, so the URL → bytes mapping never changes. R2's 30-day lifecycle
// can delete the underlying object, but a re-request will regenerate or
// re-upload byte-identical content under the same URL, so `immutable` is
// safe and avoids unnecessary revalidation traffic.
export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
