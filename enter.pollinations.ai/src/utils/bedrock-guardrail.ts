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
        contentPolicy?: { filters?: ContentFilter[] };
        sensitiveInformationPolicy?: {
            piiEntities?: PIIFilter[];
            regexes?: RegexFilter[];
        };
    }[];
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
    const body = JSON.stringify({
        source,
        content: [{ text: { text } }],
    });

    const signer = new SignatureV4({
        service: "bedrock",
        region: env.AWS_BEDROCK_REGION,
        credentials: {
            accessKeyId: env.AWS_BEDROCK_ACCESS_KEY_ID,
            secretAccessKey: env.AWS_BEDROCK_SECRET_ACCESS_KEY,
        },
        sha256: Sha256,
    });
    const urlObj = new URL(url);
    const signed = await signer.sign({
        method: "POST",
        path: urlObj.pathname,
        protocol: "https",
        hostname: urlObj.hostname,
        headers: { host: urlObj.host, "Content-Type": "application/json" },
        body,
    });

    const response = await fetch(url, {
        method: "POST",
        headers: signed.headers,
        body,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
            `Bedrock Guardrail API error ${response.status}: ${errorText}`,
        );
    }
    return response.json();
}
