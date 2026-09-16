import { getTinybirdDatasourceIngestUrl } from "@shared/events.ts";

export type ProductEvent =
    | "page_viewed"
    | "checkout_started"
    // Pre-login stages. flow_id is a random browser cookie value (sign-in) or
    // the device_code row id (device flow), never a code, token or email.
    | "sign_in_viewed"
    | "sign_in_started"
    | "sign_in_completed"
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
