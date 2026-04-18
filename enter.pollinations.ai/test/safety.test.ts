import { describe, expect, it } from "vitest";
import {
    computeTriggeredFeatures,
    expandDefaults,
    resolveEffectiveSafety,
} from "@/middleware/safety.ts";
import type { BedrockResponse } from "@/utils/bedrock-guardrail.ts";

describe("resolveEffectiveSafety", () => {
    it("returns empty set when both sources are undefined", () => {
        expect(resolveEffectiveSafety(undefined, undefined).size).toBe(0);
    });

    it("parses comma-separated features", () => {
        const result = resolveEffectiveSafety(null, "privacy,secrets");
        expect(result).toEqual(new Set(["privacy", "secrets"]));
    });

    it("ignores invalid feature names", () => {
        const result = resolveEffectiveSafety(null, "privacy,bogus,secrets");
        expect(result).toEqual(new Set(["privacy", "secrets"]));
    });

    it("unions key-level and request-level features", () => {
        const result = resolveEffectiveSafety("privacy", "secrets");
        expect(result).toEqual(new Set(["privacy", "secrets"]));
    });

    it("key-level features cannot be removed by request", () => {
        const result = resolveEffectiveSafety("privacy,secrets", "nsfw");
        expect(result).toEqual(new Set(["privacy", "secrets", "nsfw"]));
    });

    it("accepts 'true' as a valid feature", () => {
        const result = resolveEffectiveSafety(null, "true");
        expect(result).toEqual(new Set(["true"]));
    });
});

describe("expandDefaults", () => {
    it("expands 'true' to privacy + secrets", () => {
        expect(expandDefaults(new Set(["true"]))).toEqual(
            new Set(["privacy", "secrets"]),
        );
    });

    it("expands 'nsfw' to sexual + violence", () => {
        expect(expandDefaults(new Set(["nsfw"]))).toEqual(
            new Set(["sexual", "violence"]),
        );
    });

    it("combines true + nsfw expansions", () => {
        expect(expandDefaults(new Set(["true", "nsfw"]))).toEqual(
            new Set(["privacy", "secrets", "sexual", "violence"]),
        );
    });

    it("leaves concrete features untouched", () => {
        expect(expandDefaults(new Set(["privacy", "shield"]))).toEqual(
            new Set(["privacy", "shield"]),
        );
    });
});

describe("computeTriggeredFeatures", () => {
    const emptyResponse = (
        action: "NONE" | "GUARDRAIL_INTERVENED" = "NONE",
    ): BedrockResponse => ({
        action,
        assessments: [{}],
        outputs: [],
        usage: {
            contentPolicyUnits: 0,
            sensitiveInformationPolicyUnits: 0,
            wordPolicyUnits: 0,
        },
    });

    it("returns empty when guardrail action is NONE", () => {
        const features = new Set(["privacy", "secrets"]);
        expect(computeTriggeredFeatures(emptyResponse("NONE"), features)).toEqual(
            [],
        );
    });

    it("returns empty when no assessments exist", () => {
        const response: BedrockResponse = {
            action: "GUARDRAIL_INTERVENED",
            assessments: [],
            outputs: [],
            usage: {
                contentPolicyUnits: 0,
                sensitiveInformationPolicyUnits: 0,
                wordPolicyUnits: 0,
            },
        };
        expect(
            computeTriggeredFeatures(response, new Set(["privacy"])),
        ).toEqual([]);
    });

    it("triggers 'privacy' when EMAIL PII is detected and privacy is active", () => {
        const response = emptyResponse("GUARDRAIL_INTERVENED");
        response.assessments[0] = {
            sensitiveInformationPolicy: {
                piiEntities: [
                    {
                        action: "ANONYMIZED",
                        match: "alice@example.com",
                        type: "EMAIL",
                    },
                ],
                regexes: [],
            },
        };
        expect(
            computeTriggeredFeatures(response, new Set(["privacy"])),
        ).toEqual(["privacy"]);
    });

    it("does NOT trigger when PII is detected but feature is not active", () => {
        const response = emptyResponse("GUARDRAIL_INTERVENED");
        response.assessments[0] = {
            sensitiveInformationPolicy: {
                piiEntities: [
                    {
                        action: "ANONYMIZED",
                        match: "alice@example.com",
                        type: "EMAIL",
                    },
                ],
                regexes: [],
            },
        };
        expect(
            computeTriggeredFeatures(response, new Set(["secrets"])),
        ).toEqual([]);
    });

    it("triggers 'secrets' on AWS access key detection", () => {
        const response = emptyResponse("GUARDRAIL_INTERVENED");
        response.assessments[0] = {
            sensitiveInformationPolicy: {
                piiEntities: [
                    {
                        action: "BLOCKED",
                        match: "REDACTED_AWS_KEY",
                        type: "AWS_ACCESS_KEY",
                    },
                ],
                regexes: [],
            },
        };
        expect(
            computeTriggeredFeatures(response, new Set(["secrets"])),
        ).toEqual(["secrets"]);
    });

    it("triggers 'secrets' on custom regex match (Pollinations key)", () => {
        const response = emptyResponse("GUARDRAIL_INTERVENED");
        response.assessments[0] = {
            sensitiveInformationPolicy: {
                piiEntities: [],
                regexes: [
                    {
                        action: "BLOCKED",
                        match: "sk_abc123",
                        name: "POLLINATIONS_SECRET_KEY",
                        regex: "sk_[a-zA-Z0-9]+",
                    },
                ],
            },
        };
        expect(
            computeTriggeredFeatures(response, new Set(["secrets"])),
        ).toEqual(["secrets"]);
    });

    it("triggers 'sexual' when SEXUAL content filter fires", () => {
        const response = emptyResponse("GUARDRAIL_INTERVENED");
        response.assessments[0] = {
            contentPolicy: {
                filters: [
                    {
                        action: "BLOCKED",
                        confidence: "HIGH",
                        type: "SEXUAL",
                        filterStrength: "HIGH",
                    },
                ],
            },
        };
        expect(
            computeTriggeredFeatures(response, new Set(["sexual"])),
        ).toEqual(["sexual"]);
    });

    it("triggers 'violence' for VIOLENCE, HATE, or INSULTS", () => {
        const response = emptyResponse("GUARDRAIL_INTERVENED");
        response.assessments[0] = {
            contentPolicy: {
                filters: [
                    {
                        action: "BLOCKED",
                        confidence: "HIGH",
                        type: "HATE",
                        filterStrength: "HIGH",
                    },
                ],
            },
        };
        expect(
            computeTriggeredFeatures(response, new Set(["violence"])),
        ).toEqual(["violence"]);
    });

    it("triggers 'shield' for PROMPT_ATTACK", () => {
        const response = emptyResponse("GUARDRAIL_INTERVENED");
        response.assessments[0] = {
            contentPolicy: {
                filters: [
                    {
                        action: "BLOCKED",
                        confidence: "HIGH",
                        type: "PROMPT_ATTACK",
                        filterStrength: "HIGH",
                    },
                ],
            },
        };
        expect(
            computeTriggeredFeatures(response, new Set(["shield"])),
        ).toEqual(["shield"]);
    });

    it("returns multiple triggered features in a single request", () => {
        const response = emptyResponse("GUARDRAIL_INTERVENED");
        response.assessments[0] = {
            contentPolicy: {
                filters: [
                    {
                        action: "BLOCKED",
                        confidence: "HIGH",
                        type: "SEXUAL",
                        filterStrength: "HIGH",
                    },
                ],
            },
            sensitiveInformationPolicy: {
                piiEntities: [
                    {
                        action: "ANONYMIZED",
                        match: "alice@example.com",
                        type: "EMAIL",
                    },
                ],
                regexes: [],
            },
        };
        const triggered = computeTriggeredFeatures(
            response,
            new Set(["privacy", "sexual"]),
        );
        expect(new Set(triggered)).toEqual(new Set(["privacy", "sexual"]));
    });
});
