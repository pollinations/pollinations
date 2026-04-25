/**
 * Pure logic for the safety feature system — no Hono, no Bedrock client.
 *
 * Defines the user-facing feature names (privacy/secrets/sexual/violence/shield),
 * how they map to Bedrock detection IDs (FEATURE_TRIGGERS), parsing of the
 * comma-separated `safe` value, and classification of a Bedrock response into
 * blocked/redacted feature sets.
 *
 * Kept dependency-free so it can be unit-tested without a Hono Context and
 * reused by any caller that needs the same vocabulary.
 */

import type { BedrockResponse } from "@/utils/bedrock-guardrail.ts";

// What each feature covers: PII types, regex names, and content categories.
// Bedrock returns all of these as flat string identifiers, so one map covers all.
export const FEATURE_TRIGGERS: Record<string, Set<string>> = {
    privacy: new Set([
        "EMAIL",
        "PHONE",
        "NAME",
        "ADDRESS",
        "IP_ADDRESS",
        "AGE",
        "URL",
        "USERNAME",
    ]),
    secrets: new Set([
        "AWS_ACCESS_KEY",
        "AWS_SECRET_KEY",
        "PASSWORD",
        "CREDIT_DEBIT_CARD_NUMBER",
        "CREDIT_DEBIT_CARD_CVV",
        "CREDIT_DEBIT_CARD_EXPIRY",
        "PIN",
        "US_BANK_ACCOUNT_NUMBER",
        "US_BANK_ROUTING_NUMBER",
        "POLLINATIONS_SECRET_KEY",
        "POLLINATIONS_PUBLIC_KEY",
    ]),
    sexual: new Set(["SEXUAL"]),
    violence: new Set(["VIOLENCE", "HATE", "INSULTS"]),
    shield: new Set(["PROMPT_ATTACK", "MISCONDUCT"]),
};

// Features handled by redaction (Bedrock action=ANONYMIZE) instead of blocking.
export const REDACT_FEATURES = new Set(["privacy"]);

// Shorthand aliases — expanded during parsing.
const ALIASES: Record<string, string[]> = {
    true: ["privacy", "secrets"],
    nsfw: ["sexual", "violence"],
};

const VALID_FEATURES = new Set([
    ...Object.keys(FEATURE_TRIGGERS),
    ...Object.keys(ALIASES),
]);

/**
 * Parse a comma-separated safe value into a feature set, expanding aliases.
 */
function parseSafe(value: string | undefined | null): Set<string> {
    if (!value) return new Set();
    const features = new Set<string>();
    for (const part of value.split(",")) {
        const name = part.trim().toLowerCase();
        if (!VALID_FEATURES.has(name)) continue;
        for (const expanded of ALIASES[name] ?? [name]) {
            features.add(expanded);
        }
    }
    return features;
}

/**
 * Resolve effective safety features from API key metadata + request.
 * Both sources are unioned — request can add features but not remove key-level ones.
 */
export function resolveEffectiveSafety(
    keyMetadataSafe: string | undefined | null,
    requestSafe: string | undefined | null,
): Set<string> {
    return new Set([...parseSafe(keyMetadataSafe), ...parseSafe(requestSafe)]);
}

/**
 * Walk every Bedrock-detected item, bucket each into "blocked" or "redacted"
 * based on its feature membership. Items belonging to features the caller
 * didn't request are ignored. Returns feature names (the public API surface)
 * for use in error bodies, plus the raw Bedrock IDs that were redacted for
 * the X-Safety-Redacted debug header.
 */
export function classifyTriggers(
    response: BedrockResponse,
    features: Set<string>,
): {
    blockedFeatures: Set<string>;
    redactedFeatures: Set<string>;
    redactedIds: string[];
} {
    const policy = response.assessments[0]?.sensitiveInformationPolicy;
    const filters = response.assessments[0]?.contentPolicy?.filters;

    const detected: { id: string; action: "ANONYMIZED" | "BLOCKED" }[] = [
        ...(policy?.piiEntities ?? []).map((e) => ({
            id: e.type,
            action: e.action,
        })),
        ...(policy?.regexes ?? []).map((r) => ({
            id: r.name,
            action: "BLOCKED" as const,
        })),
        ...(filters ?? [])
            .filter((f) => f.action === "BLOCKED")
            .map((f) => ({ id: f.type, action: "BLOCKED" as const })),
    ];

    const blockedFeatures = new Set<string>();
    const redactedFeatures = new Set<string>();
    const redactedIds = new Set<string>();
    for (const { id, action } of detected) {
        for (const feature of features) {
            if (!FEATURE_TRIGGERS[feature]?.has(id)) continue;
            if (action === "ANONYMIZED" && REDACT_FEATURES.has(feature)) {
                redactedFeatures.add(feature);
                redactedIds.add(id);
            } else {
                blockedFeatures.add(feature);
            }
        }
    }
    return {
        blockedFeatures,
        redactedFeatures,
        redactedIds: [...redactedIds],
    };
}
