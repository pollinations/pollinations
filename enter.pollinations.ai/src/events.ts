import type { Logger } from "@logtape/logtape";
import { capitalize, removeUnset } from "./util.ts";
import type { TinybirdEvent } from "./db/schema/event.ts";

export async function sendToTinybird(
    event: TinybirdEvent,
    tinybirdIngestUrl: string,
    tinybirdIngestToken: string,
    log: Logger,
): Promise<void> {
    const tinybirdEvent = removeUnset(event);

    try {
        const response = await fetch(tinybirdIngestUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${tinybirdIngestToken}`,
                "Content-Type": "application/x-ndjson",
            },
            body: JSON.stringify(tinybirdEvent),
        });
        if (!response.ok) {
            const errorText = await response.text();
            log.error("Tinybird API error: status={status} error={error}", {
                status: response.status,
                error: errorText,
            });
        }
    } catch (error) {
        log.error("Failed to send event to Tinybird: {error}", { error });
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
