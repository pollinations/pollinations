import {
    calculatePriceForModelDefinition,
    type ModelDefinition,
    type Usage,
} from "@shared/registry/registry.ts";
import {
    MODEL_USED_HEADER,
    USAGE_MISSING_HEADER,
    USAGE_TYPE_HEADERS,
} from "@shared/registry/usage-headers.ts";
import type { CreateChatCompletionRequest } from "@shared/schemas/openai.ts";
import { HTTPException } from "hono/http-exception";
import { getGenerationModelRegistry } from "../model-registry.ts";

const MIN_CHARGE_USD = 0.001;
const MAX_X402_OUTPUT_TOKENS = 4096;
export type X402Request = {
    method: string;
    path: string;
    headers: Record<string, string>;
    body: Record<string, unknown>;
};

export type X402Quote = {
    model: string;
    maximum: number;
    usage: Usage;
};
const X402_USAGE_TYPES = new Set<keyof Usage>([
    "promptTextTokens",
    "promptCachedTokens",
    "completionTextTokens",
]);
// completionAudioTokens means characters/UTF-8 bytes for these handlers,
// but means a whole generation or output tokens for other audio models.
const CHARACTER_BILLED_SPEECH = new Set([
    "elevenlabs",
    "elevenflash",
    "eleven-multilingual-v2",
    "eleven-dialogue",
    "grok-tts",
    "fish-audio-s2.1-pro",
    "qwen-tts",
    "qwen-tts-instruct",
    "csm-1b",
    "kokoro",
]);

function isCharacterBilledSpeech(entry: {
    id: string;
    aliases: string[];
}): boolean {
    return (
        CHARACTER_BILLED_SPEECH.has(entry.id) ||
        entry.aliases.some((alias) => CHARACTER_BILLED_SPEECH.has(alias))
    );
}

function normalizedUsd(amount: number): number {
    if (!Number.isFinite(amount) || amount < 0)
        throw new Error("Invalid x402 price");
    return Math.max(
        MIN_CHARGE_USD,
        Math.ceil((amount - Number.EPSILON) * 1_000_000) / 1_000_000,
    );
}

export function usdPrice(amount: number): string {
    return `$${normalizedUsd(amount).toFixed(6)}`;
}

function conservativeUsage(body: CreateChatCompletionRequest): Usage {
    // A token cannot contain less than one UTF-8 byte. Request bytes are a
    // conservative upper bound for the supported prompt-text bucket.
    const promptBytes = new TextEncoder().encode(JSON.stringify(body)).length;
    const outputCap = body.max_tokens as number;
    return {
        promptTextTokens: promptBytes,
        completionTextTokens: outputCap,
    };
}

function supportsX402Rates(definition: ModelDefinition): boolean {
    const sheets = [
        definition.cost,
        ...Object.values(definition.costVariants ?? {}).map((variant) => ({
            ...definition.cost,
            ...variant,
        })),
    ];
    return sheets.every((rates) => {
        const promptRate = rates.promptTextTokens ?? 0;
        return (
            promptRate > 0 &&
            (rates.completionTextTokens ?? 0) > 0 &&
            (rates.promptCachedTokens ?? 0) <= promptRate &&
            Object.entries(rates).every(
                ([usageType, rate]) =>
                    (rate ?? 0) <= 0 ||
                    X402_USAGE_TYPES.has(usageType as keyof Usage),
            )
        );
    });
}

async function modelEntry(env: CloudflareBindings, model: string) {
    const registry = await getGenerationModelRegistry(env);
    const entry = registry.resolve(model);
    if (!entry) {
        throw new HTTPException(400, {
            message: `Invalid model: "${model}"`,
        });
    }
    return entry;
}

export async function quoteX402Request(
    env: CloudflareBindings,
    request: X402Request,
): Promise<X402Quote> {
    const entry = await modelEntry(env, request.body.model as string);
    const { definition } = entry;
    const unsupported = () => {
        throw new HTTPException(400, {
            message:
                "This request has no supported x402 spending ceiling; use a Pollinations API key.",
        });
    };
    if (
        entry.communityEndpoint ||
        definition.search ||
        definition.billing?.adjustments?.length
    )
        unsupported();
    let usage: Usage;
    if (entry.eventType === "generate.text") {
        const body = request.body as CreateChatCompletionRequest;
        validateChatShape(body);
        if (!supportsX402Rates(definition)) unsupported();
        usage = conservativeUsage(body);
    } else {
        // A usage bucket alone does not specify its unit. Only these existing
        // contracts are bounded here: one image and character-billed speech.
        // Variant-priced and duration/token-priced media need their own bounds.
        if (definition.costVariants || definition.selectCostVariant)
            unsupported();
        if (definition.category === "image") {
            usage = { completionImageTokens: 1 };
        } else if (
            entry.eventType === "generate.audio" &&
            definition.outputModalities?.includes("audio") &&
            isCharacterBilledSpeech(entry)
        ) {
            const body = request.body;
            if (
                body.reference_audio ||
                body.composition_plan ||
                body.conditioning_ref
            )
                unsupported();
            usage = {
                completionAudioTokens: new TextEncoder().encode(
                    body.input as string,
                ).length,
            };
        } else {
            return unsupported();
        }
        const rates = Object.entries(definition.cost).filter(
            ([, rate]) => (rate ?? 0) > 0,
        );
        if (!rates.length || rates.some(([unit]) => !(unit in usage)))
            unsupported();
    }
    const maximumCost = { ...definition.cost };
    for (const variant of Object.values(definition.costVariants ?? {})) {
        for (const [unit, rate] of Object.entries(variant)) {
            const usageType = unit as keyof Usage;
            maximumCost[usageType] = Math.max(
                maximumCost[usageType] ?? 0,
                rate ?? 0,
            );
        }
    }
    const maximum = normalizedUsd(
        calculatePriceForModelDefinition(
            entry.id,
            usage,
            {
                ...definition,
                cost: maximumCost,
                costVariants: undefined,
                selectCostVariant: undefined,
            },
            undefined,
            undefined,
        ).totalPrice,
    );
    return { model: entry.id, maximum, usage };
}

function parseUsage(headers: Headers, quote: X402Quote): Usage {
    if (headers.get(USAGE_MISSING_HEADER) === "true") {
        throw new Error("Model usage headers are missing");
    }
    if (
        quote.usage.promptTextTokens !== undefined &&
        !headers.has(USAGE_TYPE_HEADERS.promptTextTokens) &&
        !headers.has(USAGE_TYPE_HEADERS.promptCachedTokens)
    ) {
        throw new Error("Missing prompt usage header");
    }
    for (const unit of Object.keys(quote.usage) as (keyof Usage)[]) {
        if (unit === "promptTextTokens") continue;
        if (!headers.has(USAGE_TYPE_HEADERS[unit])) {
            throw new Error(`Missing ${unit} usage header`);
        }
    }

    const usage: Usage = {};
    let found = false;
    for (const [usageType, header] of Object.entries(USAGE_TYPE_HEADERS)) {
        const raw = headers.get(header);
        if (raw === null) continue;
        found = true;
        const value = Number(raw);
        if (!raw.trim() || !Number.isSafeInteger(value) || value < 0) {
            throw new Error(`Invalid usage header: ${header}`);
        }
        usage[usageType as keyof Usage] = value;
    }
    if (!found) throw new Error("Model usage headers are missing");
    return usage;
}

export async function priceActualUsage(
    env: CloudflareBindings,
    quote: X402Quote,
    headers: Headers,
): Promise<number> {
    const usedModel = headers.get(MODEL_USED_HEADER);
    if (!usedModel) throw new Error("Model usage headers are missing");
    await modelEntry(env, usedModel);

    // Pollen prices fallbacks against the requested listing. Keep that same
    // quoted-model contract here; the served-model header is still required as
    // evidence that generation produced metered usage.
    const quoted = await modelEntry(env, quote.model);
    const actual = normalizedUsd(
        calculatePriceForModelDefinition(
            quoted.id,
            parseUsage(headers, quote),
            quoted.definition,
            undefined,
            undefined,
        ).totalPrice,
    );
    if (actual > quote.maximum) {
        throw new Error("Actual usage exceeds the authorized maximum");
    }
    return actual;
}

function validateChatShape(body: CreateChatCompletionRequest) {
    const reject = (message: string): never => {
        throw new HTTPException(400, { message });
    };
    if (!Number.isSafeInteger(body.max_tokens) || (body.max_tokens ?? 0) <= 0) {
        reject("x402 requires a positive max_tokens cap");
    }
    if ((body.max_tokens ?? 0) > MAX_X402_OUTPUT_TOKENS) {
        reject(`x402 max_tokens cannot exceed ${MAX_X402_OUTPUT_TOKENS}`);
    }
    if (body.n !== undefined && body.n !== 1) {
        reject("x402 supports one completion per request");
    }
    if (
        body.messages.some(
            (message) => !message || Array.isArray(message.content),
        )
    ) {
        reject("Multimodal input is not supported with x402");
    }
    if (
        body.web_search_options ||
        body.modalities ||
        body.audio ||
        body.reasoning_effort
    ) {
        reject(
            "Search, audio, and explicit reasoning are not supported with x402",
        );
    }
}
