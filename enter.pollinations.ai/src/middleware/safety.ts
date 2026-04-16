/**
 * Safety middleware for enter.pollinations.ai
 *
 * Reads `safe` from API key metadata and/or request (query param, header, body).
 * Calls AWS Bedrock Guardrails to scan input and block requests that trigger.
 *
 * Features:
 *   privacy  — block if emails, phones, names, addresses, IPs detected
 *   secrets  — block if API keys, passwords, tokens, credit cards detected
 *   sexual   — block sexual/nude content
 *   violence — block violence, hate speech, insults
 *   shield   — block prompt injection, misconduct
 *   nsfw     — shorthand for sexual,violence
 *   true     — shorthand for privacy,secrets
 *
 * All checks are binary: if Bedrock flags anything matching the active features,
 * the entire request is rejected with HTTP 400. No redaction, no partial pass-through.
 */

import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import {
    applyGuardrail,
    type BedrockGuardrailEnv,
    type BedrockResponse,
} from "@/utils/bedrock-guardrail.ts";

// What each feature blocks: PII types, regex names, and content categories.
// Bedrock returns all of these as flat string identifiers, so one map covers all.
const FEATURE_TRIGGERS: Record<string, Set<string>> = {
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
 * Apply safety checks to any text input.
 * Sends text to Bedrock, blocks the request if any active feature triggers.
 * Sets X-Safety-Applied header on all safe-enabled requests.
 */
export async function applySafety(
    c: Context,
    text: string,
    bodySafe?: string,
): Promise<void> {
    const features = getEffectiveFeatures(c, bodySafe);
    if (features.size === 0 || !text.trim()) return;

    c.header("X-Safety-Applied", [...features].join(","));

    let triggered: BedrockResponse;
    try {
        triggered = await applyGuardrail(
            text,
            "INPUT",
            c.env as unknown as BedrockGuardrailEnv,
        );
    } catch {
        // Bedrock unavailable — fail closed for safe-enabled requests
        c.header("X-Safety-Status", "unavailable");
        throw safetyError(503, "service_unavailable", {
            message: "Safety service temporarily unavailable",
        });
    }

    const reasons = getTriggeredReasons(triggered, features);
    if (reasons.length > 0) {
        throw safetyError(400, "content_blocked", {
            message: "Request blocked by safety filter",
            safety: { applied: [...features], triggered: reasons },
        });
    }
}

// --- Internal helpers ---

function getEffectiveFeatures(c: Context, bodySafe?: string): Set<string> {
    const env = c.env as unknown as BedrockGuardrailEnv;
    if (
        !env.BEDROCK_GUARDRAIL_ID ||
        !env.BEDROCK_GUARDRAIL_VERSION ||
        !env.AWS_BEDROCK_ACCESS_KEY_ID ||
        !env.AWS_BEDROCK_SECRET_ACCESS_KEY ||
        !env.AWS_BEDROCK_REGION
    ) {
        return new Set();
    }

    const keyMeta = c.var.auth?.apiKey?.metadata?.safe as string | undefined;
    const requestSafe =
        bodySafe || c.req.query("safe") || c.req.header("x-safe");
    return resolveEffectiveSafety(keyMeta, requestSafe);
}

/**
 * Walk every Bedrock-detected item and collect those that match an active feature.
 * Returns deduplicated identifiers (PII types or content categories) for the error response.
 */
function getTriggeredReasons(
    response: BedrockResponse,
    features: Set<string>,
): string[] {
    if (response.action !== "GUARDRAIL_INTERVENED") return [];

    const policy = response.assessments[0]?.sensitiveInformationPolicy;
    const filters = response.assessments[0]?.contentPolicy?.filters;

    const detected: string[] = [
        ...(policy?.piiEntities ?? []).map((e) => e.type),
        ...(policy?.regexes ?? []).map((r) => r.name),
        ...(filters ?? [])
            .filter((f) => f.action === "BLOCKED")
            .map((f) => f.type),
    ];

    const reasons = new Set<string>();
    for (const id of detected) {
        for (const feature of features) {
            if (FEATURE_TRIGGERS[feature]?.has(id)) {
                reasons.add(id);
                break;
            }
        }
    }
    return [...reasons];
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
