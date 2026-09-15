/** Checkout returns to a fixed page on this environment, preserving the app link. */
export function stripeCheckoutReturn(
    base: string,
    requested: string | undefined,
    pack: string,
    redirect?: string,
): string {
    const destination = new URL(
        requested === "top-up" ? "/top-up" : "/pollen",
        base,
    );
    if (redirect) destination.searchParams.set("redirect", redirect);
    destination.searchParams.set("pack", pack);
    return destination.href;
}
