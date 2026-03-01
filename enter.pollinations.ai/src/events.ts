import type { Logger } from "@logtape/logtape";
import type { TinybirdEvent } from "./db/schema/event.ts";
import { capitalize, exponentialBackoffDelay, removeUnset } from "./util.ts";

const MAX_RETRIES = 3;
const MIN_DELAY = 100;
const MAX_DELAY = 2000;

async function retryWithBackoff(
    attempt: number,
    message: string,
    status?: number,
    log?: Logger,
): Promise<void> {
    const delay = exponentialBackoffDelay(attempt, {
        minDelay: MIN_DELAY,
        maxDelay: MAX_DELAY,
        maxAttempts: MAX_RETRIES,
    });

    if (log) {
        const logData = status ? { status, attempt, delay } : { attempt, delay };
        log.warn(`${message}: attempt={attempt} delay={delay}ms`, logData);
    }

    await new Promise((resolve) => setTimeout(resolve, delay));
}

async function postToTinybird(
    url: string,
    token: string,
    body: string,
    log?: Logger,
): Promise<void> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/x-ndjson",
                },
                body,
            });

            if (response.ok) {
                return;
            }

            const errorText = await response.text();
            const isRetryable = response.status >= 500 || response.status === 429;
            const isLastAttempt = attempt === MAX_RETRIES;

            if (!isRetryable || isLastAttempt) {
                log?.error(
                    "Tinybird API error: status={status} error={error} attempt={attempt}",
                    { status: response.status, error: errorText, attempt },
                );
                return;
            }

            await retryWithBackoff(attempt, "Tinybird retry", response.status, log);
        } catch (error) {
            if (attempt === MAX_RETRIES) {
                log?.error(
                    "Failed to send event to Tinybird: {error} attempt={attempt}",
                    { error, attempt },
                );
                return;
            }

            await retryWithBackoff(attempt, "Tinybird network error, retrying", undefined, log);
        }
    }
}

export async function sendToTinybird(
    event: TinybirdEvent,
    tinybirdIngestUrl: string,
    tinybirdIngestToken: string,
    log: Logger,
): Promise<void> {
    const body = JSON.stringify(removeUnset(event));
    await postToTinybird(tinybirdIngestUrl, tinybirdIngestToken, body, log);
}

// Type for Polar event ingestion (used by test mocks)
export type PolarEvent = {
    external_customer_id: string;
    name: string;
    metadata: Record<string, unknown>;
};

export function flattenBalances(balances: Record<string, number> | null) {
    if (!balances) return {};
    return Object.fromEntries(
        Object.entries(balances).map(([slug, balance]) => {
            const meterType = slug.split(":").at(-1) || "unknown";
            return [`pollen${capitalize(meterType)}Balance`, balance];
        }),
    );
}

// Tier event types for Tinybird tier_event datasource
export type TierEventType = "tier_refill" | "tier_change" | "user_registration";

export type TierEvent = {
    event_type: TierEventType;
    environment: string;
    user_id?: string;
    tier?: string;
    pollen_amount?: number;
    user_count?: number;
    timestamp: string;
};

export async function sendTierEventToTinybird(
    event: Omit<TierEvent, "timestamp">,
    tinybirdTierIngestUrl: string | undefined,
    tinybirdIngestToken: string | undefined,
    log?: Logger,
): Promise<void> {
    if (!tinybirdTierIngestUrl) {
        log?.warn("TINYBIRD_TIER_INGEST_URL not configured, skipping tier event");
        return;
    }
    if (!tinybirdIngestToken) {
        log?.warn("TINYBIRD_INGEST_TOKEN not configured, skipping tier event");
        return;
    }

    const tierEvent: TierEvent = {
        ...event,
        timestamp: new Date().toISOString(),
    };

    await postToTinybird(tinybirdTierIngestUrl, tinybirdIngestToken, JSON.stringify(tierEvent), log);
}
