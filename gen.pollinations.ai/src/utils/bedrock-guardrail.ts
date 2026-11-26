/**
 * AWS Bedrock Guardrails integration for request-input safety checks.
 */

import type { SafetyFeature } from "@shared/schemas/safety.ts";
import { signBedrockHeaders } from "@/text/auth/bedrock.ts";

interface PIIFilter {
    action: "ANONYMIZED" | "BLOCKED";
    match?: string;
    type: string;
}

interface GuardrailOutput {
    text?: string;
}

interface RegexFilter {
    action: "BLOCKED";
    match?: string;
    name: string;
    regex?: string;
}

interface ContentFilter {
    action: "BLOCKED" | "NONE";
    confidence?: "LOW" | "NONE" | "MEDIUM" | "HIGH";
    type: string;
    filterStrength?: "LOW" | "MEDIUM" | "HIGH";
}

export interface BedrockResponse {
    action?: "NONE" | "GUARDRAIL_INTERVENED";
    usage?: {
        contentPolicyUnits?: number;
        sensitiveInformationPolicyUnits?: number;
    };
    outputs?: GuardrailOutput[];
    assessments?: {
        contentPolicy?: { filters?: ContentFilter[] };
        sensitiveInformationPolicy?: {
            piiEntities?: PIIFilter[];
            regexes?: RegexFilter[];
        };
    }[];
}

export interface BedrockGuardrailEnv {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
    guardrailIdentifier: string;
    guardrailVersion: string;
}

const SENSITIVE_FEATURES = new Set<SafetyFeature>(["privacy", "secrets"]);

/** True when every check needs only the sensitive-information policy. */
export function isSensitiveOnly(features: Set<SafetyFeature>): boolean {
    return [...features].every((feature) => SENSITIVE_FEATURES.has(feature));
}

export function resolveBedrockGuardrailEnv(
    env: CloudflareBindings,
    features: Set<SafetyFeature>,
): BedrockGuardrailEnv | null {
    const maybeEnv = env as CloudflareBindings & {
        AWS_BEDROCK_ACCESS_KEY_ID?: string;
        AWS_BEDROCK_SECRET_ACCESS_KEY?: string;
        AWS_BEDROCK_REGION?: string;
        BEDROCK_GUARDRAIL_ID?: string;
        BEDROCK_GUARDRAIL_VERSION?: string;
        BEDROCK_SENSITIVE_GUARDRAIL_ID?: string;
        BEDROCK_SENSITIVE_GUARDRAIL_VERSION?: string;
    };

    const accessKeyId =
        maybeEnv.AWS_BEDROCK_ACCESS_KEY_ID || maybeEnv.AWS_ACCESS_KEY_ID;
    const secretAccessKey =
        maybeEnv.AWS_BEDROCK_SECRET_ACCESS_KEY ||
        maybeEnv.AWS_SECRET_ACCESS_KEY;
    const region = maybeEnv.AWS_BEDROCK_REGION || maybeEnv.AWS_REGION;
    // AWS bills each configured policy per text unit. Privacy and secrets
    // checks use a guardrail without content filters, so they are not billed
    // for a content policy whose result they ignore.
    const sensitiveOnly = isSensitiveOnly(features);
    const guardrailIdentifier = sensitiveOnly
        ? maybeEnv.BEDROCK_SENSITIVE_GUARDRAIL_ID
        : maybeEnv.BEDROCK_GUARDRAIL_ID;
    const guardrailVersion = sensitiveOnly
        ? maybeEnv.BEDROCK_SENSITIVE_GUARDRAIL_VERSION
        : maybeEnv.BEDROCK_GUARDRAIL_VERSION;

    if (
        !accessKeyId ||
        !secretAccessKey ||
        !region ||
        !guardrailIdentifier ||
        !guardrailVersion
    ) {
        return null;
    }

    return {
        accessKeyId,
        secretAccessKey,
        region,
        guardrailIdentifier,
        guardrailVersion,
    };
}

export async function applyGuardrail(
    text: string | string[],
    source: "INPUT" | "OUTPUT",
    env: BedrockGuardrailEnv,
): Promise<BedrockResponse> {
    const { ApplyGuardrailCommand, BedrockRuntimeClient } = await import(
        "@aws-sdk/client-bedrock-runtime"
    );
    const { FetchHttpHandler } = await import("@smithy/fetch-http-handler");
    const client = new BedrockRuntimeClient({
        region: env.region,
        credentials: {
            accessKeyId: env.accessKeyId,
            secretAccessKey: env.secretAccessKey,
        },
        requestHandler: new FetchHttpHandler(),
    });

    return client.send(
        new ApplyGuardrailCommand({
            guardrailIdentifier: env.guardrailIdentifier,
            guardrailVersion: env.guardrailVersion,
            source,
            content: (Array.isArray(text) ? text : [text]).map((entry) => ({
                text: { text: entry },
            })),
        }),
    ) as Promise<BedrockResponse>;
}

const SHIELD_CATEGORIES = [
    "JAILBREAK",
    "PROMPT_INJECTION",
    "PROMPT_LEAKAGE",
] as const;
const INLINE_CONTENT_CATEGORIES = {
    MISCONDUCT: "shield",
    SEXUAL: "sexual",
    VIOLENCE: "violence",
    HATE: "violence",
    INSULTS: "violence",
} as const satisfies Record<string, SafetyFeature>;

type InlinePolicy = "promptAttack" | "contentFilter";
type InlineScore = { category: string; severityScore: number };
type InlineResponse = {
    results?: Partial<Record<InlinePolicy, { results?: InlineScore[] }>>;
    usage?: Partial<Record<InlinePolicy, { textUnits?: number }>>;
};

export async function checkShield(
    texts: string[],
    features: Set<SafetyFeature>,
    env: BedrockGuardrailEnv,
) {
    const messages: { role: "user"; content: { text: string }[] }[] = [];
    // API callers control the text for every role. Screen it all as untrusted.
    // Bedrock allows at most 10 content blocks per message.
    for (let index = 0; index < texts.length; index += 10) {
        messages.push({
            role: "user",
            content: texts.slice(index, index + 10).map((text) => ({ text })),
        });
    }

    const categories = (
        Object.keys(
            INLINE_CONTENT_CATEGORIES,
        ) as (keyof typeof INLINE_CONTENT_CATEGORIES)[]
    ).filter((category) => features.has(INLINE_CONTENT_CATEGORIES[category]));
    const body = JSON.stringify({
        messages,
        checks: {
            promptAttack: {
                categories: SHIELD_CATEGORIES.map((category) => ({ category })),
            },
            contentFilter: {
                categories: categories.map((category) => ({ category })),
            },
        },
    });
    const url = new URL(
        `https://bedrock-runtime.${env.region}.amazonaws.com/guardrail-checks/invoke`,
    );
    const headers = await signBedrockHeaders(
        url,
        body,
        { "content-type": "application/json" },
        env,
    );
    const result = await fetch(
        new Request(url, {
            method: "POST",
            body,
            headers,
            signal: AbortSignal.timeout(10_000),
        }),
    );
    if (!result.ok) {
        await result.body?.cancel();
        throw new Error(`Bedrock inline checks returned HTTP ${result.status}`);
    }
    const response = await result.json<InlineResponse>();

    const blockedFeatures = new Set<SafetyFeature>();
    for (const category of SHIELD_CATEGORIES) {
        if (
            severity(response.results?.promptAttack?.results, category) >= 0.8
        ) {
            blockedFeatures.add("shield");
        }
    }
    for (const category of categories) {
        if (
            severity(response.results?.contentFilter?.results, category) >= 0.6
        ) {
            blockedFeatures.add(INLINE_CONTENT_CATEGORIES[category]);
        }
    }
    return {
        blockedFeatures,
        promptAttackPolicyUnits: response.usage?.promptAttack?.textUnits,
        inlineContentPolicyUnits: response.usage?.contentFilter?.textUnits,
    };
}

function severity(results: InlineScore[] | undefined, category: string) {
    const score = results?.find(
        (result) => result.category === category,
    )?.severityScore;
    if (
        score === undefined ||
        !Number.isFinite(score) ||
        score < 0 ||
        score > 1
    ) {
        throw new Error(
            `Bedrock did not return a valid severity score for ${category}`,
        );
    }
    return score;
}
