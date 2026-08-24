/**
 * Bindings Enter's code reads that gen never holds. Tests run Enter's real
 * ServiceGateway functions in-process (test/gateway.ts), which pulls Enter's
 * Stripe modules into gen's type-check; declaring these keeps that program
 * honest without adding Stripe to gen's runtime bindings.
 */
interface CloudflareBindings {
    STRIPE_SECRET_KEY: string;
    STRIPE_AUTO_TOP_UP_PMC_ID?: string;
    STRIPE_SUCCESS_URL?: string;
}
