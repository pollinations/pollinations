import { createHmac } from "node:crypto";
import type { SafetyFeature } from "@shared/schemas/safety.ts";
import { z } from "zod";
import type {
    BedrockGuardrailEnv,
    BedrockResponse,
} from "./bedrock-guardrail.ts";
import { classifyTriggers } from "./safety-features.ts";

const CACHE_NAME = "bedrock-sensitive-messages-v1";
const TTL_SECONDS = 300;
const features = new Set<SafetyFeature>(["privacy", "secrets"]);
const redactionType = z.enum([
    "EMAIL",
    "PHONE",
    "NAME",
    "ADDRESS",
    "IP_ADDRESS",
    "AGE",
    "URL",
    "USERNAME",
]);
const snapshotSchema = z.object({
    expiresAt: z.number().int(),
    parts: z.number().int().min(1).max(128),
    prefix: z.string().regex(/^[a-f0-9]{64}$/),
    entries: z
        .array(
            z.object({
                index: z.number().int().min(0).max(127),
                offset: z.number().int().nonnegative(),
                redaction: z
                    .object({
                        start: z.number().int().nonnegative(),
                        end: z.number().int().positive(),
                        type: redactionType,
                    })
                    .optional(),
            }),
        )
        .max(25),
});

type Snapshot = z.infer<typeof snapshotSchema>;
type Entry = Snapshot["entries"][number];
type InputPart = { originalIndex: number; offset: number; text: string };

export async function scanSensitiveMessages(input: {
    texts: string[];
    parts: InputPart[];
    guardrail: BedrockGuardrailEnv;
    secret: string;
    account: string;
    model?: string;
    requestUrl: string;
    scan: (texts: string[]) => Promise<BedrockResponse>;
    cacheWrite: (write: Promise<void>) => void;
}): Promise<{ response: BedrockResponse; reusedParts: number }> {
    const { texts, parts, guardrail, scan } = input;
    const full = async () => ({
        response: await scan(parts.map((part) => part.text)),
        reusedParts: 0,
    });
    // Bound work on full histories before hashing. Bedrock still uses the same selected window.
    if (
        parts.length < 2 ||
        texts.length > 128 ||
        texts.reduce((size, text) => size + text.length, 0) > 250_000
    )
        return full();

    const fingerprint = (value: unknown) =>
        createHmac("sha256", input.secret)
            .update(
                JSON.stringify([
                    CACHE_NAME,
                    input.account,
                    input.model,
                    guardrail.region,
                    guardrail.guardrailIdentifier,
                    guardrail.guardrailVersion,
                    value,
                ]),
            )
            .digest("hex");
    const anchor = fingerprint(texts.filter((text) => text.trim()).slice(0, 2));
    const cacheKey = new URL(
        `/internal/bedrock-sensitive-cache/${anchor}`,
        input.requestUrl,
    ).toString();
    const cache = await caches.open(CACHE_NAME).catch(() => undefined);
    if (!cache) return full();
    const cached = await cache
        .match(cacheKey)
        .then((result) => result?.json())
        .catch(() => undefined);
    const parsed = snapshotSchema.safeParse(cached);
    const snapshot =
        parsed.success &&
        parsed.data.expiresAt > Date.now() &&
        parsed.data.parts <= texts.length &&
        parsed.data.prefix === fingerprint(texts.slice(0, parsed.data.parts))
            ? parsed.data
            : undefined;
    const earlier = new Map(
        snapshot?.entries
            .filter((entry) => entry.index < snapshot.parts)
            .map((entry) => [entry.index, entry]),
    );
    // Keep the neighboring previous message in the Bedrock request when new text arrives.
    const overlap =
        snapshot && texts.length > snapshot.parts
            ? parts.findLast((part) => part.originalIndex < snapshot.parts)
            : undefined;
    const hits = new Map<
        number,
        { entry: Entry; text: string; type?: string }
    >();
    const misses = parts.filter((part) => {
        const entry = earlier.get(part.originalIndex);
        if (!entry || part === overlap || part.offset < entry.offset)
            return true;
        const projected = project(part, entry);
        if (projected === undefined) return true;
        hits.set(part.originalIndex, { entry, ...projected });
        return false;
    });

    const response: BedrockResponse = misses.length
        ? await scan(misses.map((part) => part.text))
        : {
              action: "NONE",
              usage: {
                  contentPolicyUnits: 0,
                  sensitiveInformationPolicyUnits: 0,
              },
          };
    const { blockedFeatures, redactedIds } = classifyTriggers(
        response,
        features,
    );
    if (blockedFeatures.size) return { response, reusedParts: hits.size };

    const didRedact = response.action === "GUARDRAIL_INTERVENED";
    const completeRedaction =
        didRedact &&
        response.outputs?.length === misses.length &&
        response.outputs.every((output) => typeof output.text === "string");
    // An incomplete response cannot be aligned to cached parts. Preserve the existing full scan path.
    if (
        hits.size &&
        misses.length &&
        response.action !== "NONE" &&
        !completeRedaction
    ) {
        const result = await full();
        const extra = response.usage?.sensitiveInformationPolicyUnits;
        const billed = result.response.usage?.sensitiveInformationPolicyUnits;
        if (
            extra !== undefined &&
            billed !== undefined &&
            result.response.usage
        ) {
            result.response.usage.sensitiveInformationPolicyUnits =
                billed + extra;
        }
        return result;
    }

    const entries = [...hits.values()].map((hit) => hit.entry);
    const outputs = new Map<number, string>(
        [...hits].map(([index, hit]) => [index, hit.text]),
    );
    if (response.action === "NONE" || completeRedaction) {
        for (const [index, part] of misses.entries()) {
            const text = didRedact
                ? response.outputs?.[index]?.text
                : part.text;
            if (text === undefined) continue;
            outputs.set(part.originalIndex, text);
            const entry = extractEntry(part, text, redactedIds);
            if (entry) entries.push(entry);
        }
    }
    if (misses.length && entries.length) {
        // Appending text keeps the original five-minute expiry for this snapshot.
        const expiresAt =
            snapshot?.expiresAt ?? Date.now() + TTL_SECONDS * 1000;
        const remaining = Math.ceil((expiresAt - Date.now()) / 1000);
        if (remaining > 0) {
            const next: Snapshot = {
                expiresAt,
                parts: texts.length,
                prefix: fingerprint(texts),
                entries,
            };
            input.cacheWrite(
                cache
                    .put(
                        cacheKey,
                        Response.json(next, {
                            headers: {
                                "Cache-Control": `max-age=${remaining}`,
                            },
                        }),
                    )
                    .catch(() => {}),
            );
        }
    }

    const cachedTypes = new Set(
        [...hits.values()].flatMap((hit) => (hit.type ? [hit.type] : [])),
    );
    if (!hits.size || (!didRedact && !cachedTypes.size))
        return { response, reusedParts: hits.size };
    return {
        response: {
            ...response,
            action: "GUARDRAIL_INTERVENED",
            outputs: parts.map((part) => ({
                text: outputs.get(part.originalIndex),
            })),
            assessments: [
                ...(response.assessments ?? []),
                {
                    sensitiveInformationPolicy: {
                        piiEntities: [...cachedTypes].map((type) => ({
                            type,
                            action: "ANONYMIZED",
                        })),
                    },
                },
            ],
        },
        reusedParts: hits.size,
    };
}

function project(part: InputPart, entry: Entry) {
    const redaction = entry.redaction;
    if (!redaction || part.offset >= redaction.end) return { text: part.text };
    if (
        part.offset > redaction.start ||
        redaction.end <= redaction.start ||
        redaction.end - part.offset > part.text.length
    )
        return;
    return {
        text:
            part.text.slice(0, redaction.start - part.offset) +
            `{${redaction.type}}` +
            part.text.slice(redaction.end - part.offset),
        type: redaction.type,
    };
}

function extractEntry(
    part: InputPart,
    output: string,
    redactedIds: string[],
): Entry | undefined {
    const entry: Entry = { index: part.originalIndex, offset: part.offset };
    if (part.text === output) return entry;
    // Cache only rewrites that can be reconstructed from one known placeholder without retaining text.
    let start = 0;
    while (start < part.text.length && part.text[start] === output[start])
        start++;
    let end = part.text.length;
    let outputEnd = output.length;
    while (
        end > start &&
        outputEnd > start &&
        part.text[end - 1] === output[outputEnd - 1]
    ) {
        end--;
        outputEnd--;
    }
    const type = output.slice(start, outputEnd).match(/^\{([A-Z_]+)\}$/)?.[1];
    if (!type || end <= start || !redactedIds.includes(type)) return;
    const parsed = redactionType.safeParse(type);
    if (!parsed.success) return;
    return {
        ...entry,
        redaction: {
            start: start + part.offset,
            end: end + part.offset,
            type: parsed.data,
        },
    };
}
