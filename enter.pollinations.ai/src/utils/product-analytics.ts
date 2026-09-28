import { getTinybirdDatasourceIngestUrl } from "@shared/events.ts";
import { productPageViewSchema } from "@shared/product-analytics.ts";
import type { Context } from "hono";

export type ProductEvent =
    | "page_viewed"
    | "checkout_started"
    | "auto_top_up_enabled"
    | "auto_top_up_disabled"
    // Sign-in is two server-side counts, so the drop-off is measured without
    // any browser identifier: started when GitHub is requested, completed when
    // the session exists. flow_id is only the device_code row id, never a
    // code, token or email.
    | "sign_in_started"
    // GitHub sent the user back with a code, so they reached GitHub and
    // approved. Starts that never reach this are lost on GitHub's side; this
    // that never reach sign_in_completed are lost on ours.
    | "sign_in_returned"
    | "sign_in_completed"
    // A user row was created, so this sign-in was also a signup. Counting it
    // separates new from returning without joining the daily d1_user snapshot.
    | "signup_completed"
    | "authorize_granted"
    | "device_code_issued"
    | "device_approved"
    | "device_denied"
    | "device_token_issued"
    | "link_started"
    | "link_completed";

// Signups and fulfilled payments are not recorded here: join d1_user and
// stripe_event instead.
export async function captureProductEvent(
    env: Pick<
        CloudflareBindings,
        "ENVIRONMENT" | "TINYBIRD_INGEST_URL" | "TINYBIRD_INGEST_TOKEN"
    >,
    event: ProductEvent,
    // "" for stages that happen before a user exists.
    userId: string,
    properties: {
        page?: string;
        pack_key?: string;
        flow_id?: string;
        client_id?: string;
        referrer_host?: string;
        utm_source?: string;
        utm_medium?: string;
        utm_campaign?: string;
        amount_usd?: number;
    } = {},
): Promise<void> {
    try {
        const response = await fetch(
            getTinybirdDatasourceIngestUrl(
                env.TINYBIRD_INGEST_URL,
                "product_event",
            ),
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${env.TINYBIRD_INGEST_TOKEN}`,
                    "Content-Type": "application/x-ndjson",
                },
                body: JSON.stringify({
                    ...properties,
                    event,
                    user_id: userId,
                    timestamp: new Date().toISOString(),
                    environment: env.ENVIRONMENT,
                }),
                signal: AbortSignal.timeout(3000),
            },
        );
        if (!response.ok)
            console.warn("Product event ingest failed", response.status);
    } catch {
        // Best-effort analytics must never fail auth or payment fulfillment.
        console.warn("Product event ingest failed");
    }
}

/**
 * Where a sign-in or checkout was started from, read from the Referer.
 *
 * page is set only for our own routes, so the funnel divides starts by views
 * of those same pages and both sides describe one population. Our origin is
 * BETTER_AUTH_URL, the same value Better Auth uses as its baseURL, so an
 * external site whose path collides with one of ours (pollinations.ai/ vs
 * '/') is never counted as one of our pages. The Referer's own Host header is
 * not consulted: workerd omits it, which would make the check silently inert
 * in tests while passing at the edge.
 *
 * referrer_host is recorded either way. Most starts come from outside the
 * tracked routes, and without the host they are one opaque bucket.
 */
export function referringSource(
    headers: Headers | null | undefined,
    ownOrigin: string,
): { page: string; referrer_host: string } {
    const pages: readonly string[] = productPageViewSchema.shape.page.options;
    try {
        const { pathname, origin, hostname } = new URL(
            headers?.get("Referer") ?? "",
        );
        return {
            page:
                origin === ownOrigin && pages.includes(pathname)
                    ? pathname
                    : "",
            referrer_host: hostname.slice(0, 253),
        };
    } catch {
        return { page: "", referrer_host: "" };
    }
}

/** Fire-and-forget capture from a request handler. */
export function captureFromRequest(
    // biome-ignore lint/suspicious/noExplicitAny: every route shape may capture
    c: Context<any>,
    event: ProductEvent,
    userId: string,
    properties?: Parameters<typeof captureProductEvent>[3],
): void {
    c.executionCtx.waitUntil(
        captureProductEvent(c.env, event, userId, properties),
    );
}
