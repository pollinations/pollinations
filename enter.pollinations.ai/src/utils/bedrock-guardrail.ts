/**
 * AWS Bedrock Guardrails integration for enter.pollinations.ai
 * Calls the ApplyGuardrail API with SigV4 signing.
 */

import { Sha256 } from "@aws-crypto/sha256-js";
import { SignatureV4 } from "@smithy/signature-v4";

interface PIIFilter {
    action: "ANONYMIZED" | "BLOCKED";
    match: string;
    type: string;
}

interface RegexFilter {
    action: "BLOCKED";
    match: string;
    name: string;
    regex: string;
}

interface ContentFilter {
    action: "BLOCKED";
    confidence: "LOW" | "NONE" | "MEDIUM" | "HIGH";
    type: string;
    filterStrength: "LOW" | "MEDIUM" | "HIGH";
}

export interface BedrockResponse {
    action: "NONE" | "GUARDRAIL_INTERVENED";
    assessments: {
        contentPolicy?: { filters: ContentFilter[] };
        sensitiveInformationPolicy?: {
            piiEntities: PIIFilter[];
            regexes: RegexFilter[];
        };
    }[];
    outputs: { text: string }[];
    usage: {
        contentPolicyUnits: number;
        sensitiveInformationPolicyUnits: number;
        wordPolicyUnits: number;
    };
}

type GuardrailBody = {
    source: "INPUT" | "OUTPUT";
    content: { text: { text: string } }[];
};

async function signRequest(
    body: GuardrailBody,
    url: string,
    region: string,
    accessKeyId: string,
    secretAccessKey: string,
): Promise<Record<string, string>> {
    const signer = new SignatureV4({
        service: "bedrock",
        region,
        credentials: { accessKeyId, secretAccessKey },
        sha256: Sha256,
    });

    const urlObj = new URL(url);
    const signed = await signer.sign({
        method: "POST",
        path: urlObj.pathname,
        protocol: "https",
        query: Object.fromEntries(urlObj.searchParams.entries()),
        hostname: urlObj.hostname,
        headers: {
            host: urlObj.host,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    });

    return signed.headers;
}

export interface BedrockGuardrailEnv {
    AWS_BEDROCK_ACCESS_KEY_ID: string;
    AWS_BEDROCK_SECRET_ACCESS_KEY: string;
    AWS_BEDROCK_REGION: string;
    BEDROCK_GUARDRAIL_ID: string;
    BEDROCK_GUARDRAIL_VERSION: string;
}

export async function applyGuardrail(
    text: string,
    source: "INPUT" | "OUTPUT",
    env: BedrockGuardrailEnv,
): Promise<BedrockResponse> {
    const url = `https://bedrock-runtime.${env.AWS_BEDROCK_REGION}.amazonaws.com/guardrail/${env.BEDROCK_GUARDRAIL_ID}/version/${env.BEDROCK_GUARDRAIL_VERSION}/apply`;

    const body: GuardrailBody = {
        source,
        content: [{ text: { text } }],
    };

    const headers = await signRequest(
        body,
        url,
        env.AWS_BEDROCK_REGION,
        env.AWS_BEDROCK_ACCESS_KEY_ID,
        env.AWS_BEDROCK_SECRET_ACCESS_KEY,
    );

    const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
            `Bedrock Guardrail API error ${response.status}: ${errorText}`,
        );
    }

    return response.json();
}

/**
 * Redact PII in text based on Bedrock response.
 * Returns redacted text, or null if nothing was redacted.
 */
export function redactText(
    text: string,
    result: BedrockResponse,
    allowedTypes?: Set<string>,
): string | null {
    const policy = result.assessments[0]?.sensitiveInformationPolicy;
    if (!policy) return null;

    let redacted = text;

    // If Bedrock already anonymized all types and no type filter is active,
    // use its pre-masked output directly
    const hasAnonymized = policy.piiEntities?.some(
        (e) => e.action === "ANONYMIZED",
    );
    if (hasAnonymized && !allowedTypes && result.outputs?.[0]?.text) {
        redacted = result.outputs[0].text;
    } else {
        for (const entity of policy.piiEntities ?? []) {
            if (!allowedTypes || allowedTypes.has(entity.type)) {
                redacted = redacted.replaceAll(
                    entity.match,
                    `{${entity.type}}`,
                );
            }
        }
    }

    for (const regex of policy.regexes ?? []) {
        redacted = redacted.replaceAll(regex.match, `{${regex.name}}`);
    }

    return redacted !== text ? redacted : null;
}
