import { getLogger } from "@logtape/logtape";
import { sendToTinybird } from "@shared/events.ts";
import {
    priceToEventParams,
    type TinybirdEvent,
    usageToEventParams,
} from "@shared/schemas/generation-event.ts";
import { billX402Usage, type X402Quote, type X402Request } from "./pricing.ts";

/** Record settled revenue without creating a Pollen user or touching a balance. */
export async function createX402Event(
    env: CloudflareBindings,
    request: X402Request,
    quote: X402Quote,
    response: Response,
    requestId: string,
    startTime: Date,
): Promise<TinybirdEvent> {
    const { billing, usage, totalPrice, quoted, served, modelUsed } =
        await billX402Usage(env, quote, response.headers);
    const endTime = new Date();
    return {
        id: requestId,
        requestId,
        requestPath: request.path,
        startTime,
        endTime,
        responseTime: endTime.getTime() - startTime.getTime(),
        responseStatus: response.status,
        environment: env.ENVIRONMENT,
        eventType: quoted.eventType,
        selectedMeterId: "x402",
        selectedMeterSlug: "v1:meter:crypto",
        modelRequested: String(request.body.model),
        resolvedModelRequested: quote.model,
        // Preserve the exact execution identity reported by generation.
        modelUsed,
        modelProviderUsed: served.definition.provider,
        fallbackUsed: served.id !== quote.model,
        isFinal: true,
        isBilledUsage: true,
        ...priceToEventParams(billing.priceDefinition),
        ...usageToEventParams(usage),
        totalCost: billing.cost.totalCost,
        totalPrice,
        devPrice: billing.price.totalPrice,
        costVariant: billing.costVariant,
    };
}

export function sendX402Event(event: TinybirdEvent, env: CloudflareBindings) {
    return sendToTinybird(
        event,
        env.TINYBIRD_INGEST_URL,
        env.TINYBIRD_INGEST_TOKEN,
        getLogger(["x402"]),
    );
}
