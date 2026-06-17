import { z } from "zod";

export const SAFETY_FEATURES = [
    "privacy",
    "secrets",
    "sexual",
    "violence",
    "shield",
] as const;

export type SafetyFeature = (typeof SAFETY_FEATURES)[number];
export type SafeValue = string | boolean | undefined | null;
export const SAFETY_HEADER_NAME = "Pollinations-Safe";

const SAFETY_ALIASES: Record<string, SafetyFeature[]> = {
    true: ["privacy", "secrets"],
    nsfw: ["sexual", "violence"],
};

const DISABLED_SAFE_TOKENS = new Set(["false", "0"]);

export const VALID_SAFE_TOKENS = new Set([
    ...SAFETY_FEATURES,
    ...Object.keys(SAFETY_ALIASES),
    ...DISABLED_SAFE_TOKENS,
]);

const SAFE_DESCRIPTION =
    "Safety features: comma-separated list of " +
    [...SAFETY_FEATURES, ...Object.keys(SAFETY_ALIASES)].join(", ") +
    `. true enables privacy,secrets; nsfw enables sexual,violence. Also accepted in the ${SAFETY_HEADER_NAME} header. Defaults to off; false and 0 are accepted as off.`;

export function normalizeSafeValue(value: SafeValue): string | undefined {
    if (typeof value === "boolean") return value ? "true" : "false";
    if (value === null || value === undefined) return undefined;
    return value;
}

export function invalidSafeTokens(value: SafeValue): string[] {
    const normalized = normalizeSafeValue(value);
    if (!normalized) return [];
    return normalized
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter((part) => part.length > 0 && !VALID_SAFE_TOKENS.has(part));
}

export function parseSafeFeatures(value: SafeValue): Set<SafetyFeature> {
    const normalized = normalizeSafeValue(value);
    if (!normalized) return new Set();

    const features = new Set<SafetyFeature>();
    for (const part of normalized.split(",")) {
        const token = part.trim().toLowerCase();
        if (!VALID_SAFE_TOKENS.has(token)) continue;
        if (DISABLED_SAFE_TOKENS.has(token)) continue;
        for (const feature of SAFETY_ALIASES[token] ?? [
            token as SafetyFeature,
        ]) {
            features.add(feature);
        }
    }
    return features;
}

export const SafeSchema = z
    .union([z.string(), z.boolean()])
    .optional()
    .transform((value) => normalizeSafeValue(value))
    .refine((value) => invalidSafeTokens(value).length === 0, {
        message: `Unknown safe feature. Valid: ${[...VALID_SAFE_TOKENS].join(", ")}`,
    })
    .meta({ description: SAFE_DESCRIPTION });
