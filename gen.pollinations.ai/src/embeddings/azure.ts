import type { Usage } from "@shared/registry/registry.ts";

import { ensureUpstreamOk } from "@/error.ts";

const AZURE_EMBEDDINGS_ENDPOINT =
    "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/v1/embeddings";

type AzureEmbeddingRequest = {
    model: string;
    input: string[];
    dimensions?: number;
};

type AzureEmbeddingData = {
    object: "embedding";
    embedding: number[];
    index: number;
};

export type AzureEmbeddingResponse = {
    object: "list";
    data: AzureEmbeddingData[];
    model?: string;
    usage?: {
        prompt_tokens?: number;
        total_tokens?: number;
    };
};

export async function callAzureEmbed(
    env: CloudflareBindings,
    modelId: string,
    input: string[],
    dimensions?: number,
): Promise<AzureEmbeddingResponse> {
    const apiKey = env.AZURE_MYCELI_PROD_API_KEY;

    if (!apiKey) {
        throw new Error("AZURE_MYCELI_PROD_API_KEY is not configured");
    }

    const body: AzureEmbeddingRequest = {
        model: modelId,
        input,
        ...(dimensions ? { dimensions } : {}),
    };

    const response = await fetch(AZURE_EMBEDDINGS_ENDPOINT, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "api-key": apiKey,
        },
        body: JSON.stringify(body),
    });

    await ensureUpstreamOk(response, AZURE_EMBEDDINGS_ENDPOINT);
    return response.json() as Promise<AzureEmbeddingResponse>;
}

export function extractAzureUsage(response: AzureEmbeddingResponse): Usage {
    const promptTextTokens = response.usage?.prompt_tokens;

    if (typeof promptTextTokens !== "number") {
        throw new Error("Azure embedding response is missing prompt_tokens");
    }

    return { promptTextTokens };
}
