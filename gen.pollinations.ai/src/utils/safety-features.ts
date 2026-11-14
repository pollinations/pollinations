import type { SafetyFeature } from "@shared/schemas/safety.ts";
import type { BedrockResponse } from "@/utils/bedrock-guardrail.ts";

// The POLLINATIONS_* identifiers must match regex names configured on the
// deployed Bedrock guardrail, or those secret detections will not trigger.
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

export function classifyTriggers(
    response: BedrockResponse,
    features: Set<SafetyFeature>,
    options: {
        shieldExemptInputIndexes?: ReadonlySet<number>;
        inputCount?: number;
    } = {},
): {
    blockedFeatures: Set<SafetyFeature>;
    redactedIds: string[];
} {
    const assessments = response.assessments ?? [];
    // Bedrock returns one assessment per input, in request order. Only trust
    // the indexes when the counts match; otherwise fail closed and apply every
    // trigger.
    const shieldExempt =
        options.shieldExemptInputIndexes &&
        options.inputCount !== undefined &&
        assessments.length === options.inputCount
            ? options.shieldExemptInputIndexes
            : undefined;
    const detected: {
        id: string;
        action: "ANONYMIZED" | "BLOCKED";
        assessmentIndex: number;
    }[] = [];
    for (const [assessmentIndex, assessment] of assessments.entries()) {
        const policy = assessment.sensitiveInformationPolicy;
        const filters = assessment.contentPolicy?.filters;
        detected.push(
            ...(policy?.piiEntities ?? []).map((entity) => ({
                id: entity.type,
                action: entity.action,
                assessmentIndex,
            })),
            ...(policy?.regexes ?? []).map((regex) => ({
                id: regex.name,
                action: "BLOCKED" as const,
                assessmentIndex,
            })),
            ...(filters ?? [])
                .filter((filter) => filter.action === "BLOCKED")
                .map((filter) => ({
                    id: filter.type,
                    action: "BLOCKED" as const,
                    assessmentIndex,
                })),
        );
    }

    const blockedFeatures = new Set<SafetyFeature>();
    const redactedIds = new Set<string>();
    for (const { id, action, assessmentIndex } of detected) {
        for (const feature of features) {
            if (!FEATURE_TRIGGERS[feature].has(id)) continue;
            if (feature === "shield" && shieldExempt?.has(assessmentIndex)) {
                continue;
            }
            if (action === "ANONYMIZED" && REDACT_FEATURES.has(feature)) {
                redactedIds.add(id);
            } else {
                blockedFeatures.add(feature);
            }
        }
    }

    return {
        blockedFeatures,
        redactedIds: [...redactedIds],
    };
}
