import type { Logger } from "@logtape/logtape";
import { getTinybirdDatasourceIngestUrl } from "@shared/events.ts";
import { Hono } from "hono";
import { createAuth } from "../auth.ts";
import type { Env } from "../env.ts";

async function trackReferral(
    env: CloudflareBindings,
    ref: string,
    headers: Headers,
    log: Logger,
): Promise<void> {
    const timestamp = new Date().toISOString();
    let loggedIn: boolean | null = null;
    try {
        const session = await createAuth(env).api.getSession({
            headers,
            query: { disableRefresh: true },
        });
        loggedIn = Boolean(session?.user);
    } catch (error) {
        // Keep the arrival even when session lookup fails; unknown is not signed out.
        log.warn("Could not determine referral login status: {error}", {
            error,
        });
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
                metadata: JSON.stringify({ logged_in: loggedIn }),
            }),
        },
    );

    if (!response.ok) {
        log.warn("Referral event ingest failed: status={status}", {
            status: response.status,
        });
    }
}

/**
 * The `?ref=` tags the beacon records. Producers are `fixLink` call sites in
 * gen and shared; an unlisted tag still gets a 204 and is dropped silently, so
 * a new refusal link has to be named here before analytics can count it.
 */
export const TRACKED_REFERRAL_REFS: readonly string[] = [
    "image",
    "text",
    "agent_low_balance_topup",
    "agent_low_balance_quests",
    "agent_key_budget",
    "agent_grant",
    "agent_quest_pollen_only",
    "agent_quest_pollen_only_quests",
    "quest_pollen_restricted",
    "sandbox_key_budget",
];

export const referralRoutes = new Hono<Env>().post("/", (c) => {
    const ref = c.req.query("ref");

    if (ref && TRACKED_REFERRAL_REFS.includes(ref)) {
        c.executionCtx.waitUntil(
            trackReferral(c.env, ref, c.req.raw.headers, c.get("log")).catch(
                (error) =>
                    c.get("log").warn("Referral event ingest failed: {error}", {
                        error,
                    }),
            ),
        );
    }

    return c.body(null, 204);
});
