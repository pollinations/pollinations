/** Relative URLs and same-origin absolute URLs stay in the current app. */
export function isExternalHref(
    href: unknown,
    origin = globalThis.location?.origin,
): boolean {
    if (typeof href !== "string" || !/^(https?:)?\/\//i.test(href))
        return false;
    if (!origin) return true;
    try {
        return new URL(href, origin).origin !== origin;
    } catch {
        return false;
    }
}
