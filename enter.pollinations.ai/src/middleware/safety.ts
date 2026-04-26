/**
 * Hono-coupled safety glue for enter.pollinations.ai.
 *
 * Calls AWS Bedrock Guardrails to scan request input. Privacy violations are
 * redacted (PII replaced with `{EMAIL}` etc.); everything else is hard-rejected.
 * Pure feature-vocabulary logic (parsing, classification, ID-to-feature mapping)
 * lives in @/utils/safety-features.ts.
 *
 * Features:
 *   privacy  — REDACT emails, phones, names, addresses, IPs (PII placeholders)
 *   secrets  — BLOCK API keys, passwords, tokens, credit cards
 *   sexual   — BLOCK sexual/nude content
 *   violence — BLOCK violence, hate speech, insults
 *   shield   — BLOCK prompt injection, misconduct
 *   nsfw     — shorthand for sexual,violence
 *   true     — shorthand for privacy,secrets
 */

import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import {
    applyGuardrail,
    type BedrockGuardrailEnv,
    type BedrockResponse,
} from "@/utils/bedrock-guardrail.ts";
import { classifyTriggers, parseSafe } from "@/utils/safety-features.ts";

/**
 * Apply safety to text. Returns the (possibly redacted) text the caller should
 * forward upstream. If a block-feature triggers, throws HTTPException 400.
 * If safety is disabled or the text is empty, returns the original unchanged.
 */
export async function applySafety(
    c: Context,
    text: string,
    bodySafe?: string | boolean,
): Promise<string> {
    // Coerce legacy boolean form: true → "true" alias, false → off.
    const bodySafeStr =
        typeof bodySafe === "boolean"
            ? bodySafe
                ? "true"
                : undefined
            : bodySafe;
    const features = getEffectiveFeatures(c, bodySafeStr);
    if (features.size === 0 || !text.trim()) return text;

    c.header("X-Safety-Applied", [...features].join(","));

    let response: BedrockResponse;
    try {
        response = await applyGuardrail(
            text,
            "INPUT",
            c.env as unknown as BedrockGuardrailEnv,
        );
    } catch (err) {
        // Bedrock unavailable — fail closed for safe-enabled requests.
        // Log upstream status so operators can distinguish outages (5xx/429)
        // from config bugs (4xx) without changing the user-facing response.
        const upstream = err as { upstreamStatus?: number };
        c.get("log").error("Bedrock guardrail failed: {upstreamStatus} {err}", {
            upstreamStatus: upstream.upstreamStatus,
            err: String(err),
        });
        c.header("X-Safety-Status", "unavailable");
        throw safetyError(503, "service_unavailable", {
            message: "Safety service temporarily unavailable",
        });
    }

    if (response.action !== "GUARDRAIL_INTERVENED") return text;

    const { blockedFeatures, redactedFeatures, redactedIds } = classifyTriggers(
        response,
        features,
    );
    if (blockedFeatures.size > 0) {
        throw safetyError(400, "content_blocked", {
            message: "Request blocked by safety filter",
            safety: { applied: [...features], triggered: [...blockedFeatures] },
        });
    }

    // Bedrock runs all detectors regardless of the user's requested features.
    // If the user opted into privacy AND Bedrock produced a redacted output
    // different from the input, use it — covers schema drift where a new PII
    // type we don't have in FEATURE_TRIGGERS would otherwise leak through.
    // Otherwise (user didn't opt into privacy, or no redaction), pass through.
    const redacted = response.outputs?.[0]?.text;
    if (features.has("privacy") && redacted && redacted !== text) {
        if (redactedIds.length > 0) {
            c.header("X-Safety-Redacted", redactedIds.join(","));
        }
        return redacted;
    }
    return text;
}

function getEffectiveFeatures(c: Context, bodySafe?: string): Set<string> {
    const requestSafe = bodySafe || c.req.query("safe");
    const features = parseSafe(requestSafe);
    if (features.size === 0) return features;

    const env = c.env as unknown as BedrockGuardrailEnv;
    if (
        !env.BEDROCK_GUARDRAIL_ID ||
        !env.BEDROCK_GUARDRAIL_VERSION ||
        !env.AWS_BEDROCK_ACCESS_KEY_ID ||
        !env.AWS_BEDROCK_SECRET_ACCESS_KEY ||
        !env.AWS_BEDROCK_REGION
    ) {
        c.header("X-Safety-Status", "misconfigured");
        throw safetyError(503, "service_unavailable", {
            message: "Safety service not configured",
        });
    }
    return features;
}

function safetyError(
    status: 400 | 503,
    code: string,
    extra: { message: string; safety?: object },
): HTTPException {
    const body = JSON.stringify({
        error: { type: "safety_error", code, ...extra },
    });
    return new HTTPException(status, {
        res: new Response(body, {
            status,
            headers: { "Content-Type": "application/json" },
        }),
    });
}
