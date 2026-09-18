import { getTinybirdDatasourceIngestUrl } from "@shared/events.ts";
import type { Context } from "hono";

export type ProductEvent =
    | "page_viewed"
    | "checkout_started"
    | "auto_top_up_enabled"
    | "auto_top_up_disabled"
    // flow_id is the random per-tab id (page views) or the device_code row
    // id (device flow), never a code, token or email. A sign-in needs no
    // event: it is a tab whose views go from an empty user_id to a real one.
    | "authorize_granted"
    | "device_code_issued"
    | "device_approved"
    | "device_denied"
    | "device_token_issued"
    | "link_started"
    | "link_completed";

// Signups and fulfilled payments are not recorded here: join d1_user and
// stripe_event instead. Deploy the datasource and verify the existing ingest
// token's APPEND scope before enabling TINYBIRD_ANALYTICS_ENABLED and
// VITE_TINYBIRD_ANALYTICS_ENABLED.
export async function captureProductEvent(
    env: Pick<
        CloudflareBindings,
        "ENVIRONMENT" | "TINYBIRD_INGEST_URL" | "TINYBIRD_INGEST_TOKEN"
    > & { TINYBIRD_ANALYTICS_ENABLED?: string },
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
    eventId: string = crypto.randomUUID(),
): Promise<void> {
    if (env.TINYBIRD_ANALYTICS_ENABLED !== "true") return;
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
                    event_id: eventId,
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
 * Fire-and-forget capture from a request handler. Browsers that ask not to be
 * measured are skipped here too, not just on the page-view beacon.
 */
export function captureFromRequest(
    // biome-ignore lint/suspicious/noExplicitAny: every route shape may capture
    c: Context<any>,
    event: ProductEvent,
    userId: string,
    properties?: Parameters<typeof captureProductEvent>[3],
    eventId?: string,
): void {
    if (c.req.header("DNT") === "1" || c.req.header("Sec-GPC") === "1") return;
    c.executionCtx.waitUntil(
        captureProductEvent(c.env, event, userId, properties, eventId),
    );
}
