import { z } from "zod";

// Route templates only: never accept a URL, arbitrary properties or a user ID
// from the browser. This list is not derived from routeTree.gen.ts: a new
// route drops its page views silently until it is added here.
//
// No browser identifier is sent: there is no cookie and no random id. The
// referrer hostname (never a path) and the utm_* / ref values of the landing
// URL are kept in sessionStorage so they survive the GitHub redirect, and are
// repeated on every view; a signed-in view therefore carries the source the
// user arrived from, which is what attribution joins on. client_id is the
// public app key of an OAuth or device entry, read from the page URL. Values
// are length-capped, not filtered.
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
        "/news",
        "/pollen",
        "/keys",
        "/models",
        "/my-models",
        "/quests",
        "/activity",
        "/account",
    ]),
    client_id: z.string().max(100).optional(),
    referrer_host: z.string().max(253).optional(),
    utm_source: z.string().max(100).optional(),
    utm_medium: z.string().max(100).optional(),
    utm_campaign: z.string().max(100).optional(),
});
