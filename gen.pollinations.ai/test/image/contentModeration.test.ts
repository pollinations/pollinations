import { describe, expect, it } from "vitest";
import {
    CONTENT_POLICY_ERROR_CODE,
    CONTENT_POLICY_STATUS,
    contentPolicyMessage,
    firstContentPolicyMessage,
    isContentPolicyViolation,
} from "../../src/image/utils/contentModeration.ts";

// Real upstream rejection messages observed in production (Tinybird
// recent_server_errors, 2026-06). Every one of these must classify as a
// content-policy violation so it surfaces as a 4xx, not a 5xx.
const REAL_MODERATION_MESSAGES = [
    // Alibaba DashScope (wan, wan-pro, wan-fast)
    "Green net check failed for input image",
    "Green net check failed for output video",
    "Green net check failed for input text",
    "Green net check failed for image (input): Input data may contain inappropriate content.",
    "Output data may contain inappropriate content.",
    // Replicate (seedance-2.0, seedance-pro, seedream, seedream-pro, seedream5)
    "Seedance 2.0 generation failed: Prediction failed: Async prediction failed: ContentModerationError: Content flagged for: sexual",
    "Seedance Pro-Fast generation failed: Content flagged for: sexual",
    "Seedance Pro-Fast generation failed: Content flagged and reported for containing illegal material",
    "Seedream 5.0 Lite generation failed: Prediction failed: Async prediction failed: ContentModerationError: Content flagged for: sexual",
    "Seedream 4.5 Pro generation failed: Prediction failed: Async prediction failed: ContentModerationError: Content flagged for: sexual",
    "Seedream 4.0 generation failed: Content flagged for: sexual",
    "Seedream 4.0 generation failed: Content flagged and reported for containing illegal material",
    // Vertex AI Gemini (nanobanana)
    "Vertex AI Gemini image generation failed: Content policy violation detected in response",
    // Azure Content Safety (kontext, gpt-image)
    "Prompt contains unsafe content: sexual, violence",
    "Input image contains unsafe content: hate",
];

// Genuine backend/infra failures that MUST stay 5xx — never misclassified as
// content policy.
const NON_MODERATION_MESSAGES = [
    "The service is currently experiencing high load and cannot process your request. Please try again later.",
    "No image URL in Wan-Image response",
    "Vertex AI API error: 500 Internal Server Error",
    "Request timed out after 120000ms",
    "fetch failed: getaddrinfo ENOTFOUND",
    "Rate limit exceeded, please retry",
    "Internal server error",
    // Infra failures of the moderation service itself must stay 5xx — they are
    // NOT a rejection of the user's content. Guards against the bare-"moderation"
    // matcher swallowing outages (and against re-adding a space-separated form).
    "moderation service unavailable",
    "Content moderation service temporarily unavailable",
];

describe("isContentPolicyViolation", () => {
    it.each(
        REAL_MODERATION_MESSAGES,
    )("flags real moderation message as content policy: %s", (message) => {
        expect(isContentPolicyViolation(message)).toBe(true);
    });

    it.each(
        NON_MODERATION_MESSAGES,
    )("does NOT flag genuine backend failure: %s", (message) => {
        expect(isContentPolicyViolation(message)).toBe(false);
    });

    it("returns false for empty, null, or undefined", () => {
        expect(isContentPolicyViolation("")).toBe(false);
        expect(isContentPolicyViolation(null)).toBe(false);
        expect(isContentPolicyViolation(undefined)).toBe(false);
    });

    it("is case-insensitive", () => {
        expect(isContentPolicyViolation("GREEN NET CHECK FAILED")).toBe(true);
        expect(isContentPolicyViolation("content FLAGGED for: sexual")).toBe(
            true,
        );
    });
});

describe("firstContentPolicyMessage", () => {
    it("returns the matching message even when an earlier candidate is generic", () => {
        // Defends against a provider putting a generic message in the JSON body
        // while the real moderation reason lives only in error.message.
        expect(
            firstContentPolicyMessage([
                "Image provider error",
                "Content flagged for: sexual",
            ]),
        ).toBe("Content flagged for: sexual");
    });

    it("skips null/undefined candidates", () => {
        expect(
            firstContentPolicyMessage([
                null,
                undefined,
                "Green net check failed",
            ]),
        ).toBe("Green net check failed");
    });

    it("returns undefined when no candidate is a content-policy violation", () => {
        expect(
            firstContentPolicyMessage(["Request timed out", "Internal error"]),
        ).toBeUndefined();
    });
});

describe("content-policy constants", () => {
    it("uses 422 Unprocessable Entity", () => {
        expect(CONTENT_POLICY_STATUS).toBe(422);
    });

    it("uses a stable, detectable error code", () => {
        expect(CONTENT_POLICY_ERROR_CODE).toBe("content_policy_violation");
    });
});

describe("contentPolicyMessage", () => {
    it("explains the issue and preserves the provider's reason", () => {
        const msg = contentPolicyMessage("Content flagged for: sexual");
        expect(msg.toLowerCase()).toContain("content moderation");
        expect(msg).toContain("Content flagged for: sexual");
    });

    it("still returns a clear explanation when no detail is provided", () => {
        const msg = contentPolicyMessage("");
        expect(msg.toLowerCase()).toContain("content moderation");
    });
});
