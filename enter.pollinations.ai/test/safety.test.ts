import { describe, expect, it } from "vitest";
import type { BedrockResponse } from "@/utils/bedrock-guardrail.ts";
import {
    classifyTriggers,
    resolveEffectiveSafety,
} from "@/utils/safety-features.ts";

const intervened = (
    assessment: NonNullable<BedrockResponse["assessments"]>[0],
    outputs?: BedrockResponse["outputs"],
): BedrockResponse => ({
    action: "GUARDRAIL_INTERVENED",
    assessments: [assessment],
    outputs,
});

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
        expect(result).toEqual(
            new Set(["privacy", "secrets", "sexual", "violence"]),
        );
    });

    it("expands 'true' alias to privacy + secrets", () => {
        const result = resolveEffectiveSafety(null, "true");
        expect(result).toEqual(new Set(["privacy", "secrets"]));
    });

    it("expands 'nsfw' alias to sexual + violence", () => {
        const result = resolveEffectiveSafety(null, "nsfw");
        expect(result).toEqual(new Set(["sexual", "violence"]));
    });
});

describe("classifyTriggers", () => {
    it("returns empty when no detections present", () => {
        const result = classifyTriggers(intervened({}), new Set(["privacy"]));
        expect(result.blockedFeatures).toEqual(new Set());
        expect(result.redactedFeatures).toEqual(new Set());
        expect(result.redactedIds).toEqual([]);
    });

    it("redacts EMAIL under privacy", () => {
        const response = intervened({
            sensitiveInformationPolicy: {
                piiEntities: [
                    { action: "ANONYMIZED", match: "a@b.com", type: "EMAIL" },
                ],
            },
        });
        const result = classifyTriggers(response, new Set(["privacy"]));
        expect(result.redactedFeatures).toEqual(new Set(["privacy"]));
        expect(result.redactedIds).toEqual(["EMAIL"]);
        expect(result.blockedFeatures).toEqual(new Set());
    });

    it("ignores PII when privacy not requested", () => {
        const response = intervened({
            sensitiveInformationPolicy: {
                piiEntities: [
                    { action: "ANONYMIZED", match: "a@b.com", type: "EMAIL" },
                ],
            },
        });
        const result = classifyTriggers(response, new Set(["secrets"]));
        expect(result.blockedFeatures).toEqual(new Set());
        expect(result.redactedFeatures).toEqual(new Set());
    });

    it("blocks AWS_ACCESS_KEY under secrets", () => {
        const response = intervened({
            sensitiveInformationPolicy: {
                piiEntities: [
                    {
                        action: "BLOCKED",
                        match: "AKIA...",
                        type: "AWS_ACCESS_KEY",
                    },
                ],
            },
        });
        const result = classifyTriggers(response, new Set(["secrets"]));
        expect(result.blockedFeatures).toEqual(new Set(["secrets"]));
        expect(result.redactedFeatures).toEqual(new Set());
    });

    it("blocks custom regex match (Pollinations key)", () => {
        const response = intervened({
            sensitiveInformationPolicy: {
                regexes: [
                    {
                        action: "BLOCKED",
                        match: "sk_abc",
                        name: "POLLINATIONS_SECRET_KEY",
                        regex: "sk_[a-z0-9]+",
                    },
                ],
            },
        });
        const result = classifyTriggers(response, new Set(["secrets"]));
        expect(result.blockedFeatures).toEqual(new Set(["secrets"]));
    });

    it("blocks SEXUAL content under sexual", () => {
        const response = intervened({
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
        });
        const result = classifyTriggers(response, new Set(["sexual"]));
        expect(result.blockedFeatures).toEqual(new Set(["sexual"]));
    });

    it("blocks HATE under violence", () => {
        const response = intervened({
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
        });
        const result = classifyTriggers(response, new Set(["violence"]));
        expect(result.blockedFeatures).toEqual(new Set(["violence"]));
    });

    it("blocks PROMPT_ATTACK under shield", () => {
        const response = intervened({
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
        });
        const result = classifyTriggers(response, new Set(["shield"]));
        expect(result.blockedFeatures).toEqual(new Set(["shield"]));
    });

    it("ignores filters with action !== BLOCKED", () => {
        const response = intervened({
            contentPolicy: {
                filters: [
                    {
                        action: "NONE" as unknown as "BLOCKED",
                        confidence: "LOW",
                        type: "SEXUAL",
                        filterStrength: "LOW",
                    },
                ],
            },
        });
        const result = classifyTriggers(response, new Set(["sexual"]));
        expect(result.blockedFeatures).toEqual(new Set());
    });

    it("collects multiple features in one response", () => {
        const response = intervened({
            sensitiveInformationPolicy: {
                piiEntities: [
                    { action: "ANONYMIZED", match: "a@b.com", type: "EMAIL" },
                    {
                        action: "BLOCKED",
                        match: "AKIA",
                        type: "AWS_ACCESS_KEY",
                    },
                ],
            },
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
        });
        const result = classifyTriggers(
            response,
            new Set(["privacy", "secrets", "sexual"]),
        );
        expect(result.redactedFeatures).toEqual(new Set(["privacy"]));
        expect(result.redactedIds).toEqual(["EMAIL"]);
        expect(result.blockedFeatures).toEqual(new Set(["secrets", "sexual"]));
    });

    it("ignores items not mapped to any requested feature", () => {
        const response = intervened({
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
        });
        const result = classifyTriggers(response, new Set(["privacy"]));
        expect(result.blockedFeatures).toEqual(new Set());
        expect(result.redactedFeatures).toEqual(new Set());
    });
});
