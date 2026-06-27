// Cache-Control for R2-backed responses (generated text, image, audio, video,
// and media uploads). Content is content-addressed or fully deterministic by
// request, so the URL → bytes mapping never changes. R2's 30-day lifecycle
// can delete the underlying object, but a re-request will regenerate or
// re-upload byte-identical content under the same URL, so `immutable` is
// safe and avoids unnecessary revalidation traffic.
export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
export const PRIVATE_NO_STORE_CACHE_CONTROL = "private, no-store, max-age=0";
export const NO_CACHE_PRAGMA = "no-cache";

export function setPrivateNoStoreHeaders(c: {
    header: (name: string, value: string) => void;
}): void {
    c.header("Cache-Control", PRIVATE_NO_STORE_CACHE_CONTROL);
    c.header("Pragma", NO_CACHE_PRAGMA);
}
