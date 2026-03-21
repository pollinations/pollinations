import { describe, expect, it } from "vitest";
import { resolveEffectiveSafety } from "@/middleware/safety.ts";
import { type BedrockResponse, redactText } from "@/utils/bedrock-guardrail.ts";

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

describe("redactText", () => {
    type Assessment = BedrockResponse["assessments"][0];
    type PiiEntities = Assessment["sensitiveInformationPolicy"]["piiEntities"];
    type Regexes = Assessment["sensitiveInformationPolicy"]["regexes"];

    function makeResponse(
        piiEntities: PiiEntities = [],
        regexes: Regexes = [],
        outputText?: string,
    ): BedrockResponse {
        return {
            action:
                piiEntities.length > 0 || regexes.length > 0
                    ? "GUARDRAIL_INTERVENED"
                    : "NONE",
            assessments: [
                {
                    sensitiveInformationPolicy: { piiEntities, regexes },
                },
            ],
            outputs: outputText ? [{ text: outputText }] : [],
            usage: {
                contentPolicyUnits: 0,
                sensitiveInformationPolicyUnits: 1,
                wordPolicyUnits: 0,
            },
        };
    }

    it("returns null when no PII detected", () => {
        const response: BedrockResponse = {
            action: "NONE",
            assessments: [{}],
            outputs: [],
            usage: {
                contentPolicyUnits: 0,
                sensitiveInformationPolicyUnits: 0,
                wordPolicyUnits: 0,
            },
        };
        expect(redactText("hello world", response)).toBeNull();
    });

    it("redacts PII matches with type tokens", () => {
        const response = makeResponse([
            { action: "BLOCKED", match: "test@example.com", type: "EMAIL" },
        ]);
        expect(redactText("my email is test@example.com", response)).toBe(
            "my email is {EMAIL}",
        );
    });

    it("redacts multiple PII types", () => {
        const response = makeResponse([
            { action: "BLOCKED", match: "test@example.com", type: "EMAIL" },
            { action: "BLOCKED", match: "555-1234", type: "PHONE" },
        ]);
        expect(
            redactText("email: test@example.com phone: 555-1234", response),
        ).toBe("email: {EMAIL} phone: {PHONE}");
    });

    it("only redacts allowed types when filter is provided", () => {
        const response = makeResponse([
            { action: "BLOCKED", match: "test@example.com", type: "EMAIL" },
            {
                action: "BLOCKED",
                match: "AKIAIOSFODNN7EXAMPLE",
                type: "AWS_ACCESS_KEY",
            },
        ]);
        const emailOnly = new Set(["EMAIL"]);
        expect(
            redactText(
                "email: test@example.com key: AKIAIOSFODNN7EXAMPLE",
                response,
                emailOnly,
            ),
        ).toBe("email: {EMAIL} key: AKIAIOSFODNN7EXAMPLE");
    });

    it("redacts regex matches (custom patterns)", () => {
        const response = makeResponse(
            [],
            [
                {
                    action: "BLOCKED",
                    match: "sk_abc123",
                    name: "POLLINATIONS_SECRET_KEY",
                    regex: "sk_[a-zA-Z0-9]+",
                },
            ],
        );
        expect(redactText("my key is sk_abc123", response)).toBe(
            "my key is {POLLINATIONS_SECRET_KEY}",
        );
    });

    it("skips regex matches when allowedTypes excludes them", () => {
        const response = makeResponse(
            [
                {
                    action: "BLOCKED",
                    match: "test@example.com",
                    type: "EMAIL",
                },
            ],
            [
                {
                    action: "BLOCKED",
                    match: "sk_abc123",
                    name: "POLLINATIONS_SECRET_KEY",
                    regex: "sk_[a-zA-Z0-9]+",
                },
            ],
        );
        const privacyOnly = new Set(["EMAIL"]);
        expect(
            redactText(
                "email: test@example.com key: sk_abc123",
                response,
                privacyOnly,
            ),
        ).toBe("email: {EMAIL} key: sk_abc123");
    });

    it("uses Bedrock anonymized output when available", () => {
        const response = makeResponse(
            [
                {
                    action: "ANONYMIZED",
                    match: "test@example.com",
                    type: "EMAIL",
                },
            ],
            [],
            "my email is {EMAIL}",
        );
        expect(redactText("my email is test@example.com", response)).toBe(
            "my email is {EMAIL}",
        );
    });
});
