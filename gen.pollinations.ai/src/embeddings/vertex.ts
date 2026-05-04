import type { Usage } from "@shared/registry/registry.ts";
import { ensureUpstreamOk } from "@/error.ts";
import googleCloudAuth from "@/text/auth/googleCloudAuth.ts";
import type {
    GeminiEmbedResponse,
    GeminiModality,
    GeminiPart,
    GeminiTaskType,
} from "./types.ts";

const VERTEX_REGION = "us-central1";
const GOOGLE_ENV_KEYS = [
    "GOOGLE_CLIENT_EMAIL",
    "GOOGLE_PRIVATE_KEY",
    "GOOGLE_PRIVATE_KEY_ID",
    "GOOGLE_PROJECT_ID",
] as const satisfies readonly (keyof CloudflareBindings)[];

const MODALITY_TO_USAGE_KEY: Record<GeminiModality, keyof Usage> = {
    TEXT: "promptTextTokens",
    IMAGE: "promptImageTokens",
    AUDIO: "promptAudioTokens",
    VIDEO: "promptVideoTokens",
};

export function syncGoogleEnvironment(env: CloudflareBindings): void {
    for (const key of GOOGLE_ENV_KEYS) {
        const value = env[key];
        if (value === "not-a-secret-workers-test-only" && process.env[key]) {
            continue;
        }
        if (typeof value === "string") {
            process.env[key] = value;
        }
    }
}

function getTestGoogleAccessToken(env: CloudflareBindings): string | null {
    if (env.ENVIRONMENT !== "test") return null;

    const token = (env as unknown as Record<string, unknown>)
        .TEST_GOOGLE_ACCESS_TOKEN;
    return typeof token === "string" && token ? token : null;
}

export function extractModalityUsage(result: GeminiEmbedResponse): Usage {
    const details = result.usageMetadata?.promptTokensDetails;
    if (details && details.length > 0) {
        const usage: Usage = {};
        for (const { modality, tokenCount } of details) {
            if (!modality || !tokenCount) continue;
            const key = MODALITY_TO_USAGE_KEY[modality];
            if (key) {
                usage[key] = (usage[key] ?? 0) + tokenCount;
            }
        }
        return usage;
    }
    return { promptTextTokens: result.usageMetadata?.promptTokenCount ?? 0 };
}

export async function callGeminiEmbed(
    env: CloudflareBindings,
    modelId: string,
    parts: GeminiPart[],
    taskType?: GeminiTaskType,
    outputDimensionality?: number,
): Promise<GeminiEmbedResponse> {
    const googleProjectId =
        env.GOOGLE_PROJECT_ID || process.env.GOOGLE_PROJECT_ID;
    if (!googleProjectId) {
        throw new Error("GOOGLE_PROJECT_ID not configured");
    }

    const accessToken =
        getTestGoogleAccessToken(env) ??
        (await googleCloudAuth.getAccessToken());
    if (!accessToken) {
        throw new Error(
            "Google Cloud authentication failed — missing or invalid credentials",
        );
    }

    const url = `https://${VERTEX_REGION}-aiplatform.googleapis.com/v1beta1/projects/${googleProjectId}/locations/${VERTEX_REGION}/publishers/google/models/${modelId}:embedContent`;

    const body = {
        content: { parts },
        embedContentConfig: {
            ...(taskType && { taskType }),
            ...(outputDimensionality && { outputDimensionality }),
        },
    };

    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
    });

    await ensureUpstreamOk(response, url);

    return response.json() as Promise<GeminiEmbedResponse>;
}
