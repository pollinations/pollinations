import type { Logger } from "@logtape/logtape";
import type { TinybirdEvent } from "./db/schema/event.ts";
import { capitalize, exponentialBackoffDelay, removeUnset } from "./util.ts";

const MAX_RETRIES = 3;
const MIN_DELAY = 100;
const MAX_DELAY = 2000;

export async function sendToTinybird(
    event: TinybirdEvent,
    tinybirdIngestUrl: string,
    tinybirdIngestToken: string,
    log: Logger,
): Promise<void> {
    const tinybirdEvent = removeUnset(event);
    const body = JSON.stringify(tinybirdEvent);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(tinybirdIngestUrl, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${tinybirdIngestToken}`,
                    "Content-Type": "application/x-ndjson",
                },
                body,
            });

            if (response.ok) {
                return;
            }

            const errorText = await response.text();
            const isRetryable =
                response.status >= 500 || response.status === 429;

            if (!isRetryable || attempt === MAX_RETRIES) {
                log.error(
                    "Tinybird API error: status={status} error={error} attempt={attempt}",
                    { status: response.status, error: errorText, attempt },
                );
                return;
            }

            const delay = exponentialBackoffDelay(attempt, {
                minDelay: MIN_DELAY,
                maxDelay: MAX_DELAY,
                maxAttempts: MAX_RETRIES,
            });
            log.warn(
                "Tinybird retry: status={status} attempt={attempt} delay={delay}ms",
                {
                    status: response.status,
                    attempt,
                    delay,
                },
            );
            await new Promise((r) => setTimeout(r, delay));
        } catch (error) {
            if (attempt === MAX_RETRIES) {
                log.error(
                    "Failed to send event to Tinybird: {error} attempt={attempt}",
                    {
                        error,
                        attempt,
                    },
                );
                return;
            }

            const delay = exponentialBackoffDelay(attempt, {
                minDelay: MIN_DELAY,
                maxDelay: MAX_DELAY,
                maxAttempts: MAX_RETRIES,
            });
            log.warn(
                "Tinybird network error, retrying: attempt={attempt} delay={delay}ms",
                {
                    attempt,
                    delay,
                },
            );
            await new Promise((r) => setTimeout(r, delay));
        }
    }
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
        log?.warn(
            "TINYBIRD_TIER_INGEST_URL not configured, skipping tier event",
        );
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

    const body = JSON.stringify(tierEvent);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(tinybirdTierIngestUrl, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${tinybirdIngestToken}`,
                    "Content-Type": "application/x-ndjson",
                },
                body,
            });

            if (response.ok) {
                return;
            }

            const errorText = await response.text();
            const isRetryable =
                response.status >= 500 || response.status === 429;

            if (!isRetryable || attempt === MAX_RETRIES) {
                log?.error(
                    "Tinybird tier event error: status={status} error={error} attempt={attempt}",
                    { status: response.status, error: errorText, attempt },
                );
                return;
            }

            const delay = exponentialBackoffDelay(attempt, {
                minDelay: MIN_DELAY,
                maxDelay: MAX_DELAY,
                maxAttempts: MAX_RETRIES,
            });
            log?.warn(
                "Tinybird tier event retry: status={status} attempt={attempt} delay={delay}ms",
                { status: response.status, attempt, delay },
            );
            await new Promise((r) => setTimeout(r, delay));
        } catch (error) {
            if (attempt === MAX_RETRIES) {
                log?.error(
                    "Failed to send tier event to Tinybird: {error} attempt={attempt}",
                    { error, attempt },
                );
                return;
            }

            const delay = exponentialBackoffDelay(attempt, {
                minDelay: MIN_DELAY,
                maxDelay: MAX_DELAY,
                maxAttempts: MAX_RETRIES,
            });
            log?.warn(
                "Tinybird tier event network error, retrying: attempt={attempt} delay={delay}ms",
                { attempt, delay },
            );
            await new Promise((r) => setTimeout(r, delay));
        }
    }
}
