/**
 * Safety middleware for enter.pollinations.ai
 *
 * Reads `safe` from API key metadata and/or request (query param, header, body).
 * Calls AWS Bedrock Guardrails to scan input. Privacy violations are redacted
 * (PII replaced with `{EMAIL}` etc.); everything else is hard-rejected.
 *
 * Features:
 *   privacy  — REDACT emails, phones, names, addresses, IPs (PII placeholders)
 *   secrets  — BLOCK API keys, passwords, tokens, credit cards
 *   sexual   — BLOCK sexual/nude content
 *   violence — BLOCK violence, hate speech, insults
 *   shield   — BLOCK prompt injection, misconduct
 *   nsfw     — shorthand for sexual,violence
 *   true     — shorthand for privacy,secrets
 *
 * Bedrock guardrail config must set PII action=ANONYMIZE and content/regex
 * policies to BLOCK. If anything in a block-feature triggers, request fails
 * with HTTP 400. Otherwise the (possibly redacted) text is returned and the
 * caller forwards it to the upstream service.
 */

import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import {
    applyGuardrail,
    type BedrockGuardrailEnv,
    type BedrockResponse,
} from "@/utils/bedrock-guardrail.ts";

// What each feature covers: PII types, regex names, and content categories.
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

// Features handled by redaction (Bedrock action=ANONYMIZE) instead of blocking.
const REDACT_FEATURES = new Set(["privacy"]);

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
 * Apply safety to text. Returns the (possibly redacted) text the caller should
 * forward upstream. If a block-feature triggers, throws HTTPException 400.
 * If safety is disabled or the text is empty, returns the original unchanged.
 */
export async function applySafety(
    c: Context,
    text: string,
    bodySafe?: string,
): Promise<string> {
    const features = getEffectiveFeatures(c, bodySafe);
    if (features.size === 0 || !text.trim()) return text;

    c.header("X-Safety-Applied", [...features].join(","));

    let response: BedrockResponse;
    try {
        response = await applyGuardrail(
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

    if (response.action !== "GUARDRAIL_INTERVENED") return text;

    const { blocked, redacted } = classifyTriggers(response, features);
    if (blocked.length > 0) {
        throw safetyError(400, "content_blocked", {
            message: "Request blocked by safety filter",
            safety: { applied: [...features], triggered: blocked },
        });
    }

    if (redacted.length > 0 && response.outputs?.[0]?.text) {
        c.header("X-Safety-Redacted", redacted.join(","));
        return response.outputs[0].text;
    }
    return text;
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
 * Walk every Bedrock-detected item, bucket each into "blocked" or "redacted"
 * based on its feature membership. Items belonging to features the caller
 * didn't request are ignored.
 */
function classifyTriggers(
    response: BedrockResponse,
    features: Set<string>,
): { blocked: string[]; redacted: string[] } {
    const policy = response.assessments[0]?.sensitiveInformationPolicy;
    const filters = response.assessments[0]?.contentPolicy?.filters;

    const detected: { id: string; action: "ANONYMIZED" | "BLOCKED" }[] = [
        ...(policy?.piiEntities ?? []).map((e) => ({
            id: e.type,
            action: e.action,
        })),
        ...(policy?.regexes ?? []).map((r) => ({
            id: r.name,
            action: "BLOCKED" as const,
        })),
        ...(filters ?? [])
            .filter((f) => f.action === "BLOCKED")
            .map((f) => ({ id: f.type, action: "BLOCKED" as const })),
    ];

    const blocked = new Set<string>();
    const redacted = new Set<string>();
    for (const { id, action } of detected) {
        for (const feature of features) {
            if (!FEATURE_TRIGGERS[feature]?.has(id)) continue;
            if (action === "ANONYMIZED" && REDACT_FEATURES.has(feature)) {
                redacted.add(id);
            } else {
                blocked.add(id);
            }
            break;
        }
    }
    return { blocked: [...blocked], redacted: [...redacted] };
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
