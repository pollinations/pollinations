/**
 * AWS Bedrock Guardrails integration for enter.pollinations.ai
 * Calls the ApplyGuardrail API with SigV4 signing.
 * Extracted and simplified from portkey-gateway bedrock plugin.
 */

import { Sha256 } from "@aws-crypto/sha256-js";
import { SignatureV4 } from "@smithy/signature-v4";

// --- Types (from Bedrock API) ---

export type BedrockBody = {
    source: "INPUT" | "OUTPUT";
    content: { text: { text: string } }[];
};

type PIIType =
    | "ADDRESS"
    | "AGE"
    | "AWS_ACCESS_KEY"
    | "AWS_SECRET_KEY"
    | "CA_HEALTH_NUMBER"
    | "CA_SOCIAL_INSURANCE_NUMBER"
    | "CREDIT_DEBIT_CARD_CVV"
    | "CREDIT_DEBIT_CARD_EXPIRY"
    | "CREDIT_DEBIT_CARD_NUMBER"
    | "DRIVER_ID"
    | "EMAIL"
    | "INTERNATIONAL_BANK_ACCOUNT_NUMBER"
    | "IP_ADDRESS"
    | "LICENSE_PLATE"
    | "MAC_ADDRESS"
    | "NAME"
    | "PASSWORD"
    | "PHONE"
    | "PIN"
    | "SWIFT_CODE"
    | "UK_NATIONAL_HEALTH_SERVICE_NUMBER"
    | "UK_NATIONAL_INSURANCE_NUMBER"
    | "UK_UNIQUE_TAXPAYER_REFERENCE_NUMBER"
    | "URL"
    | "USERNAME"
    | "US_BANK_ACCOUNT_NUMBER"
    | "US_BANK_ROUTING_NUMBER"
    | "US_INDIVIDUAL_TAX_IDENTIFICATION_NUMBER"
    | "US_PASSPORT_NUMBER"
    | "US_SOCIAL_SECURITY_NUMBER"
    | "VEHICLE_IDENTIFICATION_NUMBER";

interface PIIFilter {
    action: "ANONYMIZED" | "BLOCKED";
    match: string;
    type: PIIType;
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
    type:
        | "INSULTS"
        | "HATE"
        | "SEXUAL"
        | "VIOLENCE"
        | "MISCONDUCT"
        | "PROMPT_ATTACK";
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
    output: { text: string }[];
    usage: {
        contentPolicyUnits: number;
        sensitiveInformationPolicyUnits: number;
        wordPolicyUnits: number;
    };
}

// --- SigV4 signing ---

async function signRequest(
    body: BedrockBody,
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
    const headers: Record<string, string> = {
        host: urlObj.host,
        "Content-Type": "application/json",
    };

    const signed = await signer.sign({
        method: "POST",
        path: urlObj.pathname,
        protocol: "https",
        query: Object.fromEntries(urlObj.searchParams.entries()),
        hostname: urlObj.hostname,
        headers,
        body: JSON.stringify(body),
    });

    return signed.headers;
}

// --- Public API ---

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

    const body: BedrockBody = {
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

    const hasAnonymized = policy.piiEntities?.some(
        (e) => e.action === "ANONYMIZED",
    );

    let redacted = text;

    if (hasAnonymized && result.output?.[0]?.text) {
        // Bedrock already masked — use its output directly
        // But only if we're not filtering by type
        if (!allowedTypes) {
            redacted = result.output[0].text;
        } else {
            // Manually replace only allowed types
            for (const entity of policy.piiEntities ?? []) {
                if (allowedTypes.has(entity.type)) {
                    redacted = redacted.replaceAll(
                        entity.match,
                        `{${entity.type}}`,
                    );
                }
            }
        }
    } else {
        // Replace matches manually
        for (const entity of policy.piiEntities ?? []) {
            if (!allowedTypes || allowedTypes.has(entity.type)) {
                redacted = redacted.replaceAll(
                    entity.match,
                    `{${entity.type}}`,
                );
            }
        }
    }

    // Always redact regex matches (custom patterns like Pollinations keys)
    for (const regex of policy.regexes ?? []) {
        redacted = redacted.replaceAll(regex.match, `{${regex.name}}`);
    }

    return redacted !== text ? redacted : null;
}
