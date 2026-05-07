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

const MODALITY_TO_USAGE_KEY: Record<GeminiModality, keyof Usage> = {
    TEXT: "promptTextTokens",
    IMAGE: "promptImageTokens",
    AUDIO: "promptAudioTokens",
    VIDEO: "promptVideoTokens",
};

export function syncGoogleEnvironment(env: CloudflareBindings): void {
    for (const key of [
        "GOOGLE_CLIENT_EMAIL",
        "GOOGLE_PRIVATE_KEY",
        "GOOGLE_PRIVATE_KEY_ID",
        "GOOGLE_PROJECT_ID",
    ] as const) {
        const value = env[key];
        if (typeof value === "string") process.env[key] = value;
    }
}

export function extractModalityUsage(result: GeminiEmbedResponse): Usage {
    const details = result.usageMetadata?.promptTokensDetails;
    if (!details?.length) {
        throw new Error(
            "Vertex embed response missing promptTokensDetails — cannot bill per modality",
        );
    }
    const usage: Usage = {};
    for (const { modality, tokenCount } of details) {
        if (!modality || !tokenCount) continue;
        const key = MODALITY_TO_USAGE_KEY[modality];
        if (key) usage[key] = (usage[key] ?? 0) + tokenCount;
    }
    return usage;
}

export async function callGeminiEmbed(
    modelId: string,
    parts: GeminiPart[],
    taskType?: GeminiTaskType,
    outputDimensionality?: number,
): Promise<GeminiEmbedResponse> {
    const projectId = process.env.GOOGLE_PROJECT_ID;
    if (!projectId) throw new Error("GOOGLE_PROJECT_ID not configured");
    const accessToken = await googleCloudAuth.getAccessToken();
    if (!accessToken) {
        throw new Error("Google Cloud authentication failed");
    }

    const url = `https://${VERTEX_REGION}-aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/${VERTEX_REGION}/publishers/google/models/${modelId}:embedContent`;
    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            content: { parts },
            embedContentConfig: {
                ...(taskType && { taskType }),
                ...(outputDimensionality && { outputDimensionality }),
            },
        }),
    });
    await ensureUpstreamOk(response, url);
    return response.json() as Promise<GeminiEmbedResponse>;
}
