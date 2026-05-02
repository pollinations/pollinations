import type { SafetyFeature, SafeValue } from "@shared/schemas/safety.ts";
import { parseSafeFeatures } from "@shared/schemas/safety.ts";
import type { BedrockResponse } from "@/utils/bedrock-guardrail.ts";

const FEATURE_TRIGGERS: Record<SafetyFeature, Set<string>> = {
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

const REDACT_FEATURES = new Set<SafetyFeature>(["privacy"]);

export function resolveRequestSafety(value: SafeValue): Set<SafetyFeature> {
    return parseSafeFeatures(value);
}

export function classifyTriggers(
    response: BedrockResponse,
    features: Set<SafetyFeature>,
): {
    blockedFeatures: Set<SafetyFeature>;
    redactedFeatures: Set<SafetyFeature>;
    redactedIds: string[];
} {
    const policy = response.assessments?.[0]?.sensitiveInformationPolicy;
    const filters = response.assessments?.[0]?.contentPolicy?.filters;

    const detected: { id: string; action: "ANONYMIZED" | "BLOCKED" }[] = [
        ...(policy?.piiEntities ?? []).map((entity) => ({
            id: entity.type,
            action: entity.action,
        })),
        ...(policy?.regexes ?? []).map((regex) => ({
            id: regex.name,
            action: "BLOCKED" as const,
        })),
        ...(filters ?? [])
            .filter((filter) => filter.action === "BLOCKED")
            .map((filter) => ({
                id: filter.type,
                action: "BLOCKED" as const,
            })),
    ];

    const blockedFeatures = new Set<SafetyFeature>();
    const redactedFeatures = new Set<SafetyFeature>();
    const redactedIds = new Set<string>();
    for (const { id, action } of detected) {
        for (const feature of features) {
            if (!FEATURE_TRIGGERS[feature].has(id)) continue;
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
