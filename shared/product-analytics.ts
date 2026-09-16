import { z } from "zod";

// Route templates only: never accept a URL, arbitrary properties or a user ID
// from the browser. This list is not derived from routeTree.gen.ts: a new
// route drops its page views silently until it is added here.
export const productPageViewSchema = z.strictObject({
    page: z.enum([
        "/",
        "/top-up",
        "/sign-in",
        "/app/sign-in",
        "/authorize",
        "/device",
        "/edit-key",
        "/error",
        "/privacy",
        "/terms",
        "/refunds",
        "/_dashboard/news",
        "/_dashboard/pollen",
        "/_dashboard/keys",
        "/_dashboard/models",
        "/_dashboard/my-models",
        "/_dashboard/quests",
        "/_dashboard/activity",
        "/_dashboard/account",
    ]),
});
