/**
 * Content-policy detection for upstream image/video providers.
 *
 * Providers (Alibaba DashScope, Replicate, Vertex AI Gemini, Azure Content
 * Safety) reject disallowed prompts, input images, or generated outputs with
 * their own moderation messages. These are CLIENT errors — the request content
 * is the problem and retrying the same thing won't help — so they must surface
 * as a 4xx, never a 5xx. Labeling them 5xx pollutes model-health stats and
 * trips false "degraded"/"off" alarms on low-traffic premium models.
 *
 * We return 422 (Unprocessable Entity): the request was well-formed but its
 * content cannot be processed. It is paired with a stable
 * `content_policy_violation` error code so API clients and the model-monitor
 * can detect this case unambiguously rather than guessing from the message.
 */
export const CONTENT_POLICY_STATUS = 422;
export const CONTENT_POLICY_ERROR_CODE = "content_policy_violation";

// Substrings (matched case-insensitively) drawn from real upstream rejection
// messages. Kept deliberately specific to moderation wording so genuine backend
// failures are never swept in.
const MODERATION_PATTERNS = [
    "green net", // Alibaba DashScope "Green net check failed ..."
    "inappropriate", // "... may contain inappropriate content"
    "content filter",
    "content polic", // "Content policy violation ..." (Vertex AI)
    "contentmoderation", // Replicate "ContentModerationError" (one word —
    // deliberately NOT bare "moderation", which would also match infra
    // failures like "moderation service unavailable" and hide a real 5xx)
    "flagged", // Replicate "Content flagged for ...", "flagged as sensitive"
    "illegal material",
    "unsafe content", // Azure Content Safety "contains unsafe content"
];

/** True when an upstream error message indicates a content-policy rejection. */
export function isContentPolicyViolation(
    message: string | null | undefined,
): boolean {
    if (!message) return false;
    const lower = message.toLowerCase();
    return MODERATION_PATTERNS.some((pattern) => lower.includes(pattern));
}

/**
 * Returns the first candidate message that is a content-policy violation, or
 * undefined if none are. Used at the error funnel to check every place a
 * provider might surface the reason (parsed response body AND error.message),
 * so a generic body can't shadow moderation wording in the message.
 */
export function firstContentPolicyMessage(
    messages: Array<string | null | undefined>,
): string | undefined {
    return messages.find((message): message is string =>
        isContentPolicyViolation(message),
    );
}

/**
 * Build a clear, user-facing explanation, preserving the provider's reason so
 * the caller knows what to change.
 */
export function contentPolicyMessage(rawMessage: string): string {
    const base =
        "Your request was rejected by content moderation. The prompt, input, or generated content was flagged as disallowed — adjust your input and try again.";
    const detail = rawMessage?.trim();
    return detail ? `${base} (Reason: ${detail})` : base;
}
