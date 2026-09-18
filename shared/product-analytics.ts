import { z } from "zod";

// Route templates only: never accept a URL, arbitrary properties or a user ID
// from the browser. This list is not derived from routeTree.gen.ts: a new
// route drops its page views silently until it is added here.
//
// flow_id is a random per-tab id kept in sessionStorage, which survives the
// GitHub redirect in the same tab: a tab whose views go from an empty user_id
// to a real one completed a sign-in, so no cookie and no server hook are
// needed. client_id is the public app key of an OAuth or device entry, from
// the page URL. The referrer hostname
// (never a path) and utm_* / ref values from the landing URL are captured once
// per tab and repeated on every view. Values are length-capped, not filtered.
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
    flow_id: z.uuid(),
    client_id: z.string().max(100).optional(),
    referrer_host: z.string().max(253).optional(),
    utm_source: z.string().max(100).optional(),
    utm_medium: z.string().max(100).optional(),
    utm_campaign: z.string().max(100).optional(),
});
