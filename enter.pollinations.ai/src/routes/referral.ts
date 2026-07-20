import type { Logger } from "@logtape/logtape";
import { getTinybirdDatasourceIngestUrl } from "@shared/events.ts";
import { Hono } from "hono";
import type { Env } from "../env.ts";

const IMAGE_REF = "image";

async function trackReferral(
    env: CloudflareBindings,
    ref: string,
    log: Logger,
): Promise<void> {
    const response = await fetch(
        getTinybirdDatasourceIngestUrl(
            env.TINYBIRD_INGEST_URL,
            "referral_event",
        ),
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${env.TINYBIRD_INGEST_TOKEN}`,
                "Content-Type": "application/x-ndjson",
            },
            body: JSON.stringify({
                timestamp: new Date().toISOString(),
                ref,
            }),
        },
    );

    if (!response.ok) {
        log.warn("Referral event ingest failed: status={status}", {
            status: response.status,
        });
    }
}

export const referralRoutes = new Hono<Env>().post("/", (c) => {
    const ref = c.req.query("ref");

    if (ref === IMAGE_REF) {
        c.executionCtx.waitUntil(
            trackReferral(c.env, ref, c.get("log")).catch((error) =>
                c.get("log").warn("Referral event ingest failed: {error}", {
                    error,
                }),
            ),
        );
    }

    return c.body(null, 204);
});
