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
 *   true     — expands to privacy,secrets
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

// PII types grouped by feature
const PRIVACY_PII_TYPES = new Set([
    "EMAIL",
    "PHONE",
    "NAME",
    "ADDRESS",
    "IP_ADDRESS",
    "AGE",
    "URL",
    "USERNAME",
]);

const SECRETS_PII_TYPES = new Set([
    "AWS_ACCESS_KEY",
    "AWS_SECRET_KEY",
    "PASSWORD",
    "CREDIT_DEBIT_CARD_NUMBER",
    "CREDIT_DEBIT_CARD_CVV",
    "CREDIT_DEBIT_CARD_EXPIRY",
    "PIN",
    "US_BANK_ACCOUNT_NUMBER",
    "US_BANK_ROUTING_NUMBER",
]);

// Custom regex names mapped to secrets feature
const SECRETS_REGEX_NAMES = new Set([
    "POLLINATIONS_SECRET_KEY",
    "POLLINATIONS_PUBLIC_KEY",
]);

// Content filter categories by feature
const SEXUAL_CATEGORIES = new Set(["SEXUAL"]);
const VIOLENCE_CATEGORIES = new Set(["VIOLENCE", "HATE", "INSULTS"]);
const SHIELD_CATEGORIES = new Set(["PROMPT_ATTACK", "MISCONDUCT"]);

const DEFAULT_FEATURES = ["privacy", "secrets"];

const VALID_FEATURES = new Set([
    "privacy",
    "secrets",
    "nsfw",
    "sexual",
    "violence",
    "shield",
    "true",
]);

/**
 * Parse a safe value (string like "privacy,secrets" or "true") into a feature set.
 */
function parseSafe(value: string | undefined | null): Set<string> {
    if (!value) return new Set();
    const features = new Set<string>();
    for (const part of value.split(",")) {
        const trimmed = part.trim().toLowerCase();
        if (trimmed && VALID_FEATURES.has(trimmed)) {
            features.add(trimmed);
        }
    }
    return features;
}

/**
 * Resolve effective safety features from API key metadata + request.
 * Key-level features can't be removed by request — only additive.
 */
export function resolveEffectiveSafety(
    keyMetadataSafe: string | undefined | null,
    requestSafe: string | undefined | null,
): Set<string> {
    const keyFeatures = parseSafe(keyMetadataSafe);
    const requestFeatures = parseSafe(requestSafe);
    return new Set([...keyFeatures, ...requestFeatures]);
}

/**
 * Expand shorthand features: `true` → defaults, `nsfw` → sexual + violence.
 */
function expandDefaults(features: Set<string>): Set<string> {
    const expanded = new Set(features);
    if (expanded.has("true")) {
        expanded.delete("true");
        for (const f of DEFAULT_FEATURES) expanded.add(f);
    }
    if (expanded.has("nsfw")) {
        expanded.delete("nsfw");
        expanded.add("sexual");
        expanded.add("violence");
    }
    return expanded;
}

/**
 * Check if Bedrock response triggers any active features.
 * Returns the list of reasons (PII types + content categories) that matched.
 */
function getTriggeredReasons(
    response: BedrockResponse,
    features: Set<string>,
): string[] {
    if (response.action !== "GUARDRAIL_INTERVENED") return [];

    const reasons: string[] = [];

    // Check PII / sensitive info
    const policy = response.assessments[0]?.sensitiveInformationPolicy;
    if (policy) {
        const hasPrivacy = features.has("privacy");
        const hasSecrets = features.has("secrets");

        for (const entity of policy.piiEntities ?? []) {
            if (hasPrivacy && PRIVACY_PII_TYPES.has(entity.type)) {
                reasons.push(entity.type);
            }
            if (hasSecrets && SECRETS_PII_TYPES.has(entity.type)) {
                reasons.push(entity.type);
            }
        }
        for (const regex of policy.regexes ?? []) {
            if (hasSecrets && SECRETS_REGEX_NAMES.has(regex.name)) {
                reasons.push(regex.name);
            }
        }
    }

    // Check content filters
    const filters = response.assessments[0]?.contentPolicy?.filters;
    if (filters) {
        for (const filter of filters) {
            if (filter.action !== "BLOCKED") continue;
            if (features.has("sexual") && SEXUAL_CATEGORIES.has(filter.type)) {
                reasons.push(filter.type);
            }
            if (
                features.has("violence") &&
                VIOLENCE_CATEGORIES.has(filter.type)
            ) {
                reasons.push(filter.type);
            }
            if (features.has("shield") && SHIELD_CATEGORIES.has(filter.type)) {
                reasons.push(filter.type);
            }
        }
    }

    return reasons;
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
    if (features.size === 0) return;

    if (!text.trim()) return;

    const env = c.env as unknown as BedrockGuardrailEnv;

    let response: BedrockResponse;
    try {
        response = await applyGuardrail(text, "INPUT", env);
    } catch {
        // Bedrock unavailable — fail closed for safe-enabled requests
        c.header("X-Safety-Applied", [...features].join(","));
        c.header("X-Safety-Status", "unavailable");
        throw new HTTPException(503, {
            res: new Response(
                JSON.stringify({
                    error: {
                        message: "Safety service temporarily unavailable",
                        type: "safety_error",
                        code: "service_unavailable",
                    },
                }),
                {
                    status: 503,
                    headers: { "Content-Type": "application/json" },
                },
            ),
        });
    }

    const reasons = getTriggeredReasons(response, features);
    c.header("X-Safety-Applied", [...features].join(","));

    if (reasons.length > 0) {
        throw createSafetyError(reasons, features);
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

    const keyMeta = (
        c.var as { auth?: { apiKey?: { metadata?: Record<string, unknown> } } }
    ).auth?.apiKey?.metadata?.safe as string | undefined;

    const querySafe = c.req.query("safe");
    const headerSafe = c.req.header("x-safe");

    const raw = resolveEffectiveSafety(
        keyMeta,
        bodySafe || querySafe || headerSafe,
    );

    return expandDefaults(raw);
}

function createSafetyError(
    reasons: string[],
    features: Set<string>,
): HTTPException {
    const body = JSON.stringify({
        error: {
            message: "Request blocked by safety filter",
            type: "safety_error",
            code: "content_blocked",
            safety: {
                applied: [...features],
                triggered: [...new Set(reasons)],
            },
        },
    });

    return new HTTPException(400, {
        res: new Response(body, {
            status: 400,
            headers: { "Content-Type": "application/json" },
        }),
    });
}
