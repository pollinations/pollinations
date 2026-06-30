export const isCheckoutPricingUpdateEnabled = (
    env: Pick<CloudflareBindings, "STRIPE_MODE">,
): boolean => env.STRIPE_MODE === "sandbox";
