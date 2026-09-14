import { getLogger } from "@logtape/logtape";
import { sendToTinybird } from "@shared/events.ts";
import { calculateUsageBilling } from "@shared/registry/registry.ts";
import {
    MODEL_USED_HEADER,
    parseUsageHeaders,
} from "@shared/registry/usage-headers.ts";
import {
    priceToEventParams,
    type TinybirdEvent,
    usageToEventParams,
} from "@shared/schemas/generation-event.ts";
import { getGenerationModelRegistry } from "../model-registry.ts";
import {
    priceActualUsage,
    quoteX402Request,
    type X402Request,
} from "./pricing.ts";

/** Record settled revenue without creating a Pollen user or touching a balance. */
export async function createX402Event(
    env: CloudflareBindings,
    request: X402Request,
    response: Response,
    requestId: string,
    startTime: Date,
): Promise<TinybirdEvent> {
    const quote = await quoteX402Request(env, request);
    const totalPrice = await priceActualUsage(env, quote, response.headers);
    const registry = await getGenerationModelRegistry(env);
    const modelUsed = response.headers.get(MODEL_USED_HEADER);
    if (!modelUsed) throw new Error("Model usage headers are missing");
    const quoted = registry.resolve(quote.model);
    const served = registry.resolve(modelUsed);
    if (!quoted || !served)
        throw new Error("Accounting model is missing from the registry");
    const usage = parseUsageHeaders(response.headers);
    const billing = calculateUsageBilling({
        model: quote.model,
        usage,
        servedBy: served.definition,
        quotedBy: quoted.definition,
    });
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
