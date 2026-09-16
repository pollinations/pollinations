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

// Signed-out views of the pages where a sign-in can start. flow_id is the
// random auth_flow cookie value the browser minted; the server hooks read the
// same cookie on /sign-in/social and the GitHub callback.
export const authFlowViewSchema = z.strictObject({
    page: z.enum(["/sign-in", "/app/sign-in", "/authorize", "/device"]),
    flow_id: z.uuid(),
});
