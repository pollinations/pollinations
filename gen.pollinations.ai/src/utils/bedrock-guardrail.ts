/**
 * AWS Bedrock Guardrails integration for request-input safety checks.
 */

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

export function resolveBedrockGuardrailEnv(
    env: CloudflareBindings,
): BedrockGuardrailEnv | null {
    const maybeEnv = env as CloudflareBindings & {
        AWS_BEDROCK_ACCESS_KEY_ID?: string;
        AWS_BEDROCK_SECRET_ACCESS_KEY?: string;
        AWS_BEDROCK_REGION?: string;
        BEDROCK_GUARDRAIL_ID?: string;
        BEDROCK_GUARDRAIL_VERSION?: string;
    };

    const accessKeyId =
        maybeEnv.AWS_BEDROCK_ACCESS_KEY_ID || maybeEnv.AWS_ACCESS_KEY_ID;
    const secretAccessKey =
        maybeEnv.AWS_BEDROCK_SECRET_ACCESS_KEY ||
        maybeEnv.AWS_SECRET_ACCESS_KEY;
    const region = maybeEnv.AWS_BEDROCK_REGION || maybeEnv.AWS_REGION;
    const guardrailIdentifier = maybeEnv.BEDROCK_GUARDRAIL_ID;
    const guardrailVersion = maybeEnv.BEDROCK_GUARDRAIL_VERSION;

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
    text: string,
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
            content: [{ text: { text } }],
        }),
    ) as Promise<BedrockResponse>;
}
