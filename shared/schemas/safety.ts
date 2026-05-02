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

const SAFETY_ALIASES: Record<string, SafetyFeature[]> = {
    true: ["privacy", "secrets"],
    nsfw: ["sexual", "violence"],
};

export const VALID_SAFE_TOKENS = new Set([
    ...SAFETY_FEATURES,
    ...Object.keys(SAFETY_ALIASES),
]);

const SAFE_DESCRIPTION =
    "Safety features: comma-separated list of " +
    [...VALID_SAFE_TOKENS].join(", ") +
    ". Defaults to off.";

export function normalizeSafeValue(value: SafeValue): string | undefined {
    if (typeof value === "boolean") return value ? "true" : undefined;
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
