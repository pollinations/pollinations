/**
 * Safety middleware for enter.pollinations.ai
 *
 * Reads `safe` from API key metadata and/or request (query param, header, body).
 * Calls AWS Bedrock Guardrails to redact PII/secrets or block harmful content.
 *
 * Features:
 *   privacy  — redact emails, phones, names, addresses, IPs
 *   secrets  — redact API keys, passwords, tokens, credit cards
 *   nsfw     — block sexual/violent content
 *   shield   — block prompt injection
 *   true     — expands to privacy,secrets,shield
 */

import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import {
    applyGuardrail,
    type BedrockGuardrailEnv,
    type BedrockResponse,
    redactText,
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

// Content filter categories by feature
const NSFW_CATEGORIES = new Set(["SEXUAL", "VIOLENCE"]);
const SHIELD_CATEGORIES = new Set(["PROMPT_ATTACK"]);

const TEXT_DEFAULTS = ["privacy", "secrets", "shield"];

// All valid feature names
const VALID_FEATURES = new Set([
    "privacy",
    "secrets",
    "nsfw",
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
 * Expand `true` to default feature set.
 */
function expandDefaults(features: Set<string>): Set<string> {
    if (!features.has("true")) return features;
    const expanded = new Set(features);
    expanded.delete("true");
    for (const f of TEXT_DEFAULTS) expanded.add(f);
    return expanded;
}

/**
 * Get the allowed PII types based on active features.
 */
function getAllowedPiiTypes(features: Set<string>): Set<string> | undefined {
    const hasPrivacy = features.has("privacy");
    const hasSecrets = features.has("secrets");
    if (!hasPrivacy && !hasSecrets) return undefined;

    const allowed = new Set<string>();
    if (hasPrivacy) for (const t of PRIVACY_PII_TYPES) allowed.add(t);
    if (hasSecrets) for (const t of SECRETS_PII_TYPES) allowed.add(t);
    return allowed;
}

/**
 * Check content policy filters against active features.
 * Returns the list of triggered categories, or empty if none match.
 */
function getBlockedCategories(
    response: BedrockResponse,
    features: Set<string>,
): string[] {
    const filters = response.assessments[0]?.contentPolicy?.filters;
    if (!filters || response.action !== "GUARDRAIL_INTERVENED") return [];

    const blocked: string[] = [];
    for (const filter of filters) {
        if (filter.action !== "BLOCKED") continue;
        if (features.has("nsfw") && NSFW_CATEGORIES.has(filter.type)) {
            blocked.push(filter.type);
        }
        if (features.has("shield") && SHIELD_CATEGORIES.has(filter.type)) {
            blocked.push(filter.type);
        }
    }
    return blocked;
}

/**
 * Extract text content from chat completion messages.
 */
function extractMessagesText(
    messages: {
        role?: string;
        content?: string | { type?: string; text?: string }[];
    }[],
): string {
    const parts: string[] = [];
    for (const msg of messages) {
        if (typeof msg.content === "string") {
            parts.push(msg.content);
        } else if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
                if (part.type === "text" && part.text) {
                    parts.push(part.text);
                }
            }
        }
    }
    return parts.join("\n");
}

/**
 * Replace text content in chat completion messages with redacted version.
 * Uses simple string replacement — works because Bedrock returns exact matches.
 */
function redactMessages(
    messages: {
        role?: string;
        content?: string | { type?: string; text?: string }[];
    }[],
    redactedText: string,
): void {
    // Reconstruct: split redacted text by the same \n boundaries used in extractMessagesText
    const redactedParts = redactedText.split("\n");
    let partIndex = 0;

    for (const msg of messages) {
        if (typeof msg.content === "string") {
            if (partIndex < redactedParts.length) {
                msg.content = redactedParts[partIndex++];
            }
        } else if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
                if (part.type === "text" && part.text) {
                    if (partIndex < redactedParts.length) {
                        part.text = redactedParts[partIndex++];
                    }
                }
            }
        }
    }
}

export interface SafetyResult {
    applied: string[];
    redactedTypes: string[];
    blocked: boolean;
    blockedCategories: string[];
}

/**
 * Apply safety to a chat completions request body.
 * Modifies requestBody in place. Throws HTTPException on block.
 * Returns null if safety is not active.
 */
export async function applySafetyToChat(
    c: Context,
    requestBody: Record<string, unknown>,
): Promise<SafetyResult | null> {
    const features = getEffectiveFeatures(c, requestBody.safe as string);
    if (features.size === 0) return null;

    // Strip safe from body before forwarding
    delete requestBody.safe;

    const messages = requestBody.messages as {
        role?: string;
        content?: string | { type?: string; text?: string }[];
    }[];
    if (!messages?.length) return null;

    const text = extractMessagesText(messages);
    if (!text.trim()) return null;

    const env = c.env as unknown as BedrockGuardrailEnv;
    const response = await applyGuardrail(text, "INPUT", env);
    const result = processResponse(response, features, text);

    if (result.blocked) {
        setSafetyHeaders(c, result);
        throw createSafetyError(result);
    }

    if (result.redactedText) {
        redactMessages(messages, result.redactedText);
    }

    setSafetyHeaders(c, result);
    return {
        applied: [...features],
        redactedTypes: result.redactedTypes,
        blocked: false,
        blockedCategories: [],
    };
}

/**
 * Apply safety to a plain text prompt (GET /text/:prompt).
 * Returns the (possibly redacted) prompt, or throws on block.
 * Returns null if safety is not active.
 */
export async function applySafetyToText(
    c: Context,
    prompt: string,
): Promise<{ prompt: string; result: SafetyResult } | null> {
    const features = getEffectiveFeatures(c);
    if (features.size === 0) return null;

    if (!prompt.trim()) return null;

    const env = c.env as unknown as BedrockGuardrailEnv;
    const response = await applyGuardrail(prompt, "INPUT", env);
    const processed = processResponse(response, features, prompt);

    if (processed.blocked) {
        setSafetyHeaders(c, processed);
        throw createSafetyError(processed);
    }

    setSafetyHeaders(c, processed);
    return {
        prompt: processed.redactedText ?? prompt,
        result: {
            applied: [...features],
            redactedTypes: processed.redactedTypes,
            blocked: false,
            blockedCategories: [],
        },
    };
}

// --- Internal helpers ---

function getEffectiveFeatures(c: Context, bodySafe?: string): Set<string> {
    // Skip if Bedrock is not configured
    const env = c.env as unknown as BedrockGuardrailEnv;
    if (!env.BEDROCK_GUARDRAIL_ID || !env.AWS_BEDROCK_ACCESS_KEY_ID) {
        return new Set();
    }

    const keyMeta = (
        c.var as { auth?: { apiKey?: { metadata?: Record<string, unknown> } } }
    ).auth?.apiKey?.metadata?.safe as string | undefined;

    const querySafe = new URL(c.req.url).searchParams.get("safe");
    const headerSafe = c.req.header("x-safe");

    // Union all sources
    const raw = resolveEffectiveSafety(
        keyMeta,
        bodySafe || querySafe || headerSafe,
    );

    return expandDefaults(raw);
}

interface ProcessedResponse {
    redactedText: string | null;
    redactedTypes: string[];
    blocked: boolean;
    blockedCategories: string[];
    features: Set<string>;
}

function processResponse(
    response: BedrockResponse,
    features: Set<string>,
    originalText: string,
): ProcessedResponse {
    // Check content blocking first
    const blockedCategories = getBlockedCategories(response, features);
    if (blockedCategories.length > 0) {
        return {
            redactedText: null,
            redactedTypes: [],
            blocked: true,
            blockedCategories,
            features,
        };
    }

    // Check PII redaction
    const allowedTypes = getAllowedPiiTypes(features);
    if (!allowedTypes) {
        return {
            redactedText: null,
            redactedTypes: [],
            blocked: false,
            blockedCategories: [],
            features,
        };
    }

    const redactedText = redactText(originalText, response, allowedTypes);
    const redactedTypes: string[] = [];
    const policy = response.assessments[0]?.sensitiveInformationPolicy;
    if (policy) {
        for (const entity of policy.piiEntities ?? []) {
            if (
                allowedTypes.has(entity.type) &&
                !redactedTypes.includes(entity.type)
            ) {
                redactedTypes.push(entity.type);
            }
        }
        for (const regex of policy.regexes ?? []) {
            if (!redactedTypes.includes(regex.name)) {
                redactedTypes.push(regex.name);
            }
        }
    }

    return {
        redactedText,
        redactedTypes,
        blocked: false,
        blockedCategories: [],
        features,
    };
}

function setSafetyHeaders(
    c: Context,
    result:
        | ProcessedResponse
        | {
              applied?: string[];
              redactedTypes: string[];
              blocked: boolean;
              blockedCategories: string[];
              features?: Set<string>;
          },
): void {
    const features =
        "features" in result && result.features
            ? [...result.features]
            : ("applied" in result && result.applied) || [];
    if (features.length > 0) {
        c.header("X-Safety-Applied", features.join(","));
    }
    if (result.redactedTypes.length > 0) {
        c.header("X-Safety-Redacted", result.redactedTypes.join(","));
    }
}

function createSafetyError(result: ProcessedResponse): HTTPException {
    const triggeredFeatures: string[] = [];
    for (const cat of result.blockedCategories) {
        if (NSFW_CATEGORIES.has(cat)) triggeredFeatures.push("nsfw");
        if (SHIELD_CATEGORIES.has(cat)) triggeredFeatures.push("shield");
    }

    const body = JSON.stringify({
        error: {
            message: "Request blocked by safety filter",
            type: "safety_error",
            code: "content_blocked",
            safety: {
                triggered: [...new Set(triggeredFeatures)],
                categories: result.blockedCategories,
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
