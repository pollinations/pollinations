import type { Logger } from "@logtape/logtape";
import { apikey } from "@shared/db/better-auth.ts";
import { getTinybirdDatasourceIngestUrl } from "@shared/events.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { createAuth } from "../auth.ts";
import type { Env } from "../env.ts";

// API key ids are opaque; anything else in the URL is dropped, never stored.
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

async function trackReferral(
    env: CloudflareBindings,
    ref: string,
    keyId: string | null,
    headers: Headers,
    log: Logger,
): Promise<void> {
    const timestamp = new Date().toISOString();
    let loggedIn: boolean | null = null;
    let userId: string | undefined;
    try {
        const session = await createAuth(env).api.getSession({
            headers,
            query: { disableRefresh: true },
        });
        loggedIn = Boolean(session?.user);
        userId = session?.user?.id;
    } catch (error) {
        // Keep the arrival even when session lookup fails; unknown is not signed out.
        log.warn("Could not determine referral login status: {error}", {
            error,
        });
    }

    const metadata: Record<string, unknown> = { logged_in: loggedIn };
    if (keyId) {
        // is_owner: true = signed in as the key's owner, false = not the owner
        // or signed out, null = key not found.
        const owner = await drizzle(env.DB)
            .select({ userId: apikey.referenceId })
            .from(apikey)
            .where(eq(apikey.id, keyId))
            .get();
        metadata.key_id = keyId;
        metadata.is_owner = owner ? owner.userId === userId : null;
    }

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
                timestamp,
                ref,
                metadata: JSON.stringify(metadata),
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
    const rawKeyId = c.req.query("key_id") ?? "";
    const keyId = KEY_ID_PATTERN.test(rawKeyId) ? rawKeyId : null;

    if (
        ref === "image" ||
        ref === "agent_low_balance_topup" ||
        ref === "agent_low_balance_quests"
    ) {
        c.executionCtx.waitUntil(
            trackReferral(
                c.env,
                ref,
                keyId,
                c.req.raw.headers,
                c.get("log"),
            ).catch((error) =>
                c.get("log").warn("Referral event ingest failed: {error}", {
                    error,
                }),
            ),
        );
    }

    return c.body(null, 204);
});
