import {
    type ModelDefinition,
    calculateUsageBilling,
    getPriceDefinitionForModel,
} from "@shared/registry/registry.ts";
import {
    MODEL_USED_HEADER,
    parseUsageHeaders,
} from "@shared/registry/usage-headers.ts";
import type { Usage } from "@shared/registry/registry.ts";

/**
 * Pollen cost injection for text generation responses.
 *
 * Adds `x-pollen-cost`, `x-pollen-currency`, `x-pollen-model`, and
 * `x-pollen-pricing-available` headers to non-streaming responses, and
 * injects `usage.pollen_cost` (plus `usage.pollen_pricing_available` and
 * `usage.pollen_currency`) into the last SSE chunk that carries a `usage`
 * object for streaming responses.
 *
 * The headers and the injected `pollen_cost` always agree because both are
 * derived from the same usage and pricing definition.
 */

export const POLLEN_COST_HEADER = "x-pollen-cost";
export const POLLEN_CURRENCY_HEADER = "x-pollen-currency";
export const POLLEN_MODEL_HEADER = "x-pollen-model";
export const POLLEN_PRICING_AVAILABLE_HEADER = "x-pollen-pricing-available";

const POLLEN_CURRENCY = "pollen";

interface PollenCostFields {
    pollen_cost: number | null;
    pollen_pricing_available: boolean;
    pollen_currency: string;
}

interface PricingResolution {
    pricingAvailable: boolean;
    currency: string;
    costFields: PollenCostFields | null;
}

/**
 * Resolve pollen cost fields from usage and model definition.
 *
 * Returns null costFields when usage is empty or pricing is unavailable.
 */
function resolvePollenCost(
    usage: Usage,
    modelId: string,
    modelDef: ModelDefinition | undefined,
): PricingResolution {
    const hasUsage = Object.values(usage).some((v) => v && v > 0);
    if (!hasUsage || !modelDef) {
        return {
            pricingAvailable: false,
            currency: POLLEN_CURRENCY,
            costFields: null,
        };
    }

    const priceDef = getPriceDefinitionForModel(modelDef);
    const hasPricing = Object.values(priceDef).some(
        (v) => v !== undefined && v !== 0,
    );

    if (!hasPricing) {
        return {
            pricingAvailable: false,
            currency: POLLEN_CURRENCY,
            costFields: {
                pollen_cost: null,
                pollen_pricing_available: false,
                pollen_currency: POLLEN_CURRENCY,
            },
        };
    }

    const billing = calculateUsageBilling({
        model: modelId,
        usage,
        servedBy: modelDef,
    });
    const totalPrice = billing.price?.totalPrice ?? 0;
    const cost =
        Number.isFinite(totalPrice) && totalPrice > 0
            ? Number(totalPrice.toFixed(9))
            : 0;

    return {
        pricingAvailable: true,
        currency: POLLEN_CURRENCY,
        costFields: {
            pollen_cost: cost,
            pollen_pricing_available: true,
            pollen_currency: POLLEN_CURRENCY,
        },
    };
}

/**
 * Build pollen cost headers for a non-streaming response.
 *
 * Reads usage from the response's `x-usage-*` headers and the model from
 * `x-model-used`, then resolves pricing from the registry.
 */
export function buildPollenCostHeaders(
    response: Response,
    modelId: string,
    modelDef: ModelDefinition | undefined,
): Record<string, string> {
    const resolvedModel =
        modelId || response.headers.get(MODEL_USED_HEADER) || "";
    const usage = parseUsageHeaders(response.headers);
    const { pricingAvailable, currency, costFields } = resolvePollenCost(
        usage,
        resolvedModel,
        modelDef,
    );

    const headers: Record<string, string> = {
        [POLLEN_MODEL_HEADER]: resolvedModel,
        [POLLEN_PRICING_AVAILABLE_HEADER]: String(pricingAvailable),
        [POLLEN_CURRENCY_HEADER]: currency,
    };

    if (costFields?.pollen_cost !== null && costFields?.pollen_cost !== undefined) {
        headers[POLLEN_COST_HEADER] = String(costFields.pollen_cost);
    }

    return headers;
}

// ── SSE stream injection ─────────────────────────────────────────────────────

/**
 * Parse a single SSE `data:` line, returning the parsed JSON or null.
 */
function parseSSELine(line: string): {
    usage?: Record<string, unknown> | null;
    [key: string]: unknown;
} | null {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return null;
    const payload = trimmed.slice(5).trim();
    if (payload === "[DONE]") return null;
    try {
        return JSON.parse(payload) as {
            usage?: Record<string, unknown> | null;
            [key: string]: unknown;
        };
    } catch {
        return null;
    }
}

/**
 * Rewrite a `data:` SSE line, injecting pollen cost fields into its `usage`
 * object. Returns null if the line has no usage object to inject into.
 */
function rewriteSSELine(
    line: string,
    fields: PollenCostFields,
): string | null {
    const parsed = parseSSELine(line);
    if (!parsed || !parsed.usage || typeof parsed.usage !== "object") {
        return null;
    }
    const newUsage = { ...parsed.usage, ...fields };
    const newPayload = { ...parsed, usage: newUsage };
    return `data: ${JSON.stringify(newPayload)}`;
}

/**
 * Rewrite a block of SSE text, injecting pollen cost fields into every line
 * that carries a `usage` object.
 */
function rewriteSSEBlock(text: string, fields: PollenCostFields): string {
    const lines = text.split("\n");
    const rewritten: string[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined) {
            rewritten.push("");
            continue;
        }
        const replacement = rewriteSSELine(line, fields);
        rewritten.push(replacement ?? line);
    }
    return rewritten.join("\n");
}

/**
 * Merge two usage objects (later values win for overlapping keys).
 */
function mergeUsage(
    base: Record<string, unknown>,
    incoming: Record<string, unknown>,
): Record<string, unknown> {
    return { ...base, ...incoming };
}

/**
 * Extract usage from response headers (`x-usage-*`).
 */
function extractUsageFromHeaders(headers: Headers): Usage {
    return parseUsageHeaders(headers);
}

/**
 * Wrap a stream with pollen cost headers on the response.
 */
function wrapStreamResponse(
    response: Response,
    newBody: ReadableStream<Uint8Array>,
    costFields: PollenCostFields | null,
    modelId: string,
    pricingAvailable: boolean,
): Response {
    const headers = new Headers(response.headers);
    headers.set(POLLEN_MODEL_HEADER, modelId);
    headers.set(POLLEN_PRICING_AVAILABLE_HEADER, String(pricingAvailable));
    headers.set(POLLEN_CURRENCY_HEADER, POLLEN_CURRENCY);
    if (costFields?.pollen_cost !== null && costFields?.pollen_cost !== undefined) {
        headers.set(POLLEN_COST_HEADER, String(costFields.pollen_cost));
    }
    return new Response(newBody, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

/**
 * Inject pollen cost into an SSE streaming response.
 *
 * Two paths:
 *
 * 1. **Fast path** — when the upstream already published usage via `x-usage-*`
 *    headers, the cost is known immediately. We stream chunks straight through,
 *    rewriting usage chunks inline as they pass by.
 *
 * 2. **Buffered path** — when there are no usage headers, we don't know the
 *    cost until the upstream emits a usage chunk. We pipe non-usage chunks
 *    straight through while buffering usage chunks. Once the first usage chunk
 *    surfaces we compute the cost, flush the buffered usage chunks with the
 *    cost injected, and continue forwarding the rest of the stream in real time.
 */
export function injectPollenCostIntoStream(
    response: Response,
    modelId: string,
    modelDef: ModelDefinition | undefined,
): Response {
    if (!response || !response.body) return response;

    const headerUsage = extractUsageFromHeaders(response.headers);
    const resolvedModel = modelId || response.headers.get(MODEL_USED_HEADER) || "";

    const { pricingAvailable, currency, costFields } = resolvePollenCost(
        headerUsage,
        resolvedModel,
        modelDef,
    );

    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    const newlineCode = "\n".charCodeAt(0);

    // ── Fast path: header usage gives us the cost immediately ──────────────
    if (costFields) {
        const fields = costFields;
        let pending = "";
        const reader = response.body.getReader();

        const out = new ReadableStream<Uint8Array>({
            async pull(controller) {
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) {
                            if (pending.length) {
                                controller.enqueue(encoder.encode(pending));
                                pending = "";
                            }
                            controller.close();
                            return;
                            }
                        const text = pending + decoder.decode(value, {
                            stream: true,
                        });
                        let lastSplit = -1;
                        for (let i = 0; i < text.length; i++) {
                            if (text.charCodeAt(i) === newlineCode)
                                lastSplit = i;
                        }
                        if (lastSplit === -1) {
                            pending = text;
                            continue;
                        }
                        const outText = text.slice(0, lastSplit + 1);
                        pending = text.slice(lastSplit + 1);
                        controller.enqueue(
                            encoder.encode(rewriteSSEBlock(outText, fields)),
                        );
                    }
                } catch (err) {
                    controller.error(
                        err instanceof Error ? err : new Error(String(err)),
                    );
                }
            },
            cancel(reason) {
                try {
                    reader.cancel(reason);
                } catch {
                    // ignore
                }
            },
        });

        return wrapStreamResponse(
            response,
            out,
            costFields,
            resolvedModel,
            pricingAvailable,
        );
    }

    // ── Buffered path: wait for the first usage chunk ──────────────────────
    const reader = response.body.getReader();
    const state = {
        pending: "",
        capturedUsage: {} as Record<string, unknown>,
        costFields: null as PollenCostFields | null,
    };
    const usageBuffer: string[] = [];

    const out = new ReadableStream<Uint8Array>({
        async pull(controller) {
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        // Flush remaining usage buffer and trailing partial line.
                        const tail = state.pending;
                        state.pending = "";
                        for (const raw of usageBuffer) {
                            controller.enqueue(encoder.encode(raw));
                        }
                        usageBuffer.length = 0;
                        if (tail) controller.enqueue(encoder.encode(tail));
                        controller.close();
                        return;
                    }
                    const text = state.pending + decoder.decode(value, {
                        stream: true,
                    });
                    let lastSplit = -1;
                    for (let i = 0; i < text.length; i++) {
                        if (text.charCodeAt(i) === newlineCode) lastSplit = i;
                    }
                    if (lastSplit === -1) {
                        state.pending = text;
                        continue;
                    }
                    const outText = text.slice(0, lastSplit + 1);
                    state.pending = text.slice(lastSplit + 1);

                    // Walk lines: forward non-usage lines immediately, buffer
                    // usage lines so we can rewrite them once cost is known.
                    const parts = outText.split("\n");
                    let passThrough = "";
                    for (let i = 0; i < parts.length; i++) {
                        const part = parts[i];
                        if (part === undefined) continue;
                        const isLast = i === parts.length - 1;
                        const lineText = part + (isLast ? "" : "\n");
                        const lineInfo = parseSSELine(part);

                        if (lineInfo && lineInfo.usage) {
                            if (state.costFields) {
                                const rewritten = rewriteSSELine(
                                    part,
                                    state.costFields,
                                );
                                if (rewritten !== null) {
                                    controller.enqueue(
                                        encoder.encode(rewritten + "\n"),
                                    );
                                } else {
                                    controller.enqueue(encoder.encode(lineText));
                                }
                            } else {
                                usageBuffer.push(lineText);
                                state.capturedUsage = mergeUsage(
                                    state.capturedUsage,
                                    lineInfo.usage,
                                );

                                if (
                                    !state.costFields &&
                                    Object.keys(state.capturedUsage).length > 0
                                ) {
                                    const usage = state.capturedUsage as Usage;
                                    const resolved = resolvePollenCost(
                                        usage,
                                        resolvedModel,
                                        modelDef,
                                    );
                                    state.costFields = resolved.costFields;

                                    if (state.costFields) {
                                        // Flush buffered usage chunks with cost injected.
                                        for (const bufferedRaw of usageBuffer) {
                                            const stripped =
                                                bufferedRaw.replace(/\n$/, "");
                                            const bufferedInfo =
                                                parseSSELine(stripped);
                                            if (
                                                bufferedInfo &&
                                                bufferedInfo.usage
                                            ) {
                                                const rewritten =
                                                    rewriteSSELine(
                                                        stripped,
                                                        state.costFields,
                                                    );
                                                controller.enqueue(
                                                    encoder.encode(
                                                        (rewritten !== null
                                                            ? rewritten
                                                            : stripped) + "\n",
                                                    ),
                                                );
                                            } else {
                                                controller.enqueue(
                                                    encoder.encode(bufferedRaw),
                                                );
                                            }
                                        }
                                        usageBuffer.length = 0;
                                    }
                                }
                            }
                        } else if (lineText.length > 0) {
                            passThrough += lineText;
                        }
                    }
                    if (passThrough.length) {
                        controller.enqueue(encoder.encode(passThrough));
                    }
                }
            } catch (err) {
                controller.error(
                    err instanceof Error ? err : new Error(String(err)),
                );
            }
        },
        cancel(reason) {
            try {
                reader.cancel(reason);
            } catch {
                // ignore
            }
        },
    });

    return wrapStreamResponse(
        response,
        out,
        null,
        resolvedModel,
        pricingAvailable,
    );
}
