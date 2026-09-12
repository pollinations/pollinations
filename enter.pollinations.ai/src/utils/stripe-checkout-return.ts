/** Checkout may return to the wallet or existing dashboard, on this environment. */
export function stripeCheckoutReturn(
    base: string,
    requested: string | undefined,
    pack: string,
): string {
    const destination = new URL("/pollen", base);
    try {
        const candidate = new URL(requested ?? "/pollen", base);
        if (
            candidate.origin === destination.origin &&
            ["/pollen", "/top-up"].includes(candidate.pathname)
        ) {
            destination.pathname = candidate.pathname;
            destination.search = candidate.search;
        }
    } catch {
        /* Malformed return links fall back to the dashboard. */
    }
    destination.searchParams.set("pack", pack);
    return destination.href;
}
