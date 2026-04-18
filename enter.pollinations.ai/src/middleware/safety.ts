/**
 * Safety middleware for enter.pollinations.ai
 *
 * Reads `safe` from API key metadata and/or request (query param, header, body)
 * and sends the request text to AWS Bedrock Guardrails. If the guardrail
 * triggers on any feature the caller opted into, the whole request is rejected
 * with HTTP 400. Otherwise the request passes through unchanged.
 *
 * Features:
 *   privacy  — reject if emails/phones/names/addresses/IPs/etc. detected
 *   secrets  — reject if API keys/passwords/tokens/credit cards detected
 *   sexual   — reject sexual/nude content
 *   violence — reject violence, hate speech, insults
 *   shield   — reject prompt injection / misconduct
 *   nsfw     — shorthand for sexual,violence
 *   true     — shorthand for privacy,secrets (the defaults)
 */

import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import {
    applyGuardrail,
    type BedrockGuardrailEnv,
    type BedrockResponse,
} from "@/utils/bedrock-guardrail.ts";

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

const SECRETS_REGEX_NAMES = new Set([
    "POLLINATIONS_SECRET_KEY",
    "POLLINATIONS_PUBLIC_KEY",
]);

const SEXUAL_CATEGORIES = new Set(["SEXUAL"]);
const VIOLENCE_CATEGORIES = new Set(["VIOLENCE", "HATE", "INSULTS"]);
const SHIELD_CATEGORIES = new Set(["PROMPT_ATTACK", "MISCONDUCT"]);

const DEFAULT_FEATURES = ["privacy", "secrets"] as const;

const VALID_FEATURES = new Set([
    "privacy",
    "secrets",
    "nsfw",
    "sexual",
    "violence",
    "shield",
    "true",
]);

export interface SafetyResult {
    applied: string[];
}

/**
 * Parse a safe value (e.g. "privacy,secrets" or "true") into a feature set.
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
 * Expand shorthand features: `true` -> defaults, `nsfw` -> sexual + violence.
 */
export function expandDefaults(features: Set<string>): Set<string> {
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
 * Return the list of user-requested features that Bedrock actually triggered.
 * Empty list means accept; non-empty means reject.
 */
export function computeTriggeredFeatures(
    response: BedrockResponse,
    features: Set<string>,
): string[] {
    if (response.action !== "GUARDRAIL_INTERVENED") return [];

    const triggered = new Set<string>();
    const assessment = response.assessments[0];
    if (!assessment) return [];

    const contentFilters = assessment.contentPolicy?.filters ?? [];
    for (const filter of contentFilters) {
        if (filter.action !== "BLOCKED") continue;
        if (features.has("sexual") && SEXUAL_CATEGORIES.has(filter.type)) {
            triggered.add("sexual");
        }
        if (features.has("violence") && VIOLENCE_CATEGORIES.has(filter.type)) {
            triggered.add("violence");
        }
        if (features.has("shield") && SHIELD_CATEGORIES.has(filter.type)) {
            triggered.add("shield");
        }
    }

    const pii = assessment.sensitiveInformationPolicy?.piiEntities ?? [];
    for (const entity of pii) {
        if (features.has("privacy") && PRIVACY_PII_TYPES.has(entity.type)) {
            triggered.add("privacy");
        }
        if (features.has("secrets") && SECRETS_PII_TYPES.has(entity.type)) {
            triggered.add("secrets");
        }
    }

    const regexes = assessment.sensitiveInformationPolicy?.regexes ?? [];
    for (const regex of regexes) {
        if (features.has("secrets") && SECRETS_REGEX_NAMES.has(regex.name)) {
            triggered.add("secrets");
        }
    }

    return [...triggered];
}

/**
 * Apply safety to a text string. Throws HTTPException on block.
 * Returns null when safety is not active (unconfigured or no features requested).
 */
export async function applySafety(
    c: Context,
    text: string,
    bodySafe?: string,
): Promise<SafetyResult | null> {
    const features = getEffectiveFeatures(c, bodySafe);
    if (features.size === 0) return null;
    if (!text.trim()) return null;

    const env = c.env as unknown as BedrockGuardrailEnv;
    const response = await applyGuardrail(text, "INPUT", env);

    setSafetyAppliedHeader(c, features);

    const triggered = computeTriggeredFeatures(response, features);
    if (triggered.length > 0) {
        throw createSafetyError(triggered);
    }

    return { applied: [...features] };
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

function setSafetyAppliedHeader(c: Context, features: Set<string>): void {
    if (features.size > 0) {
        c.header("X-Safety-Applied", [...features].join(","));
    }
}

function createSafetyError(triggered: string[]): HTTPException {
    const body = JSON.stringify({
        error: {
            message: "Request blocked by safety filter",
            type: "safety_error",
            code: "content_blocked",
            triggered,
        },
    });

    return new HTTPException(400, {
        res: new Response(body, {
            status: 400,
            headers: { "Content-Type": "application/json" },
        }),
    });
}
