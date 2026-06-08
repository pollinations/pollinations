import type { Usage } from "@shared/registry/registry.ts";

import { ensureUpstreamOk } from "@/error.ts";
import type { OpenAIEmbeddingResponse } from "./openai.ts";

const COHERE_AZURE_ENDPOINT =
    "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/v1/embeddings";

type CohereAzureEmbeddingRequest = {
    model: string;
    input: string[];
    input_type: "document" | "query" | "classification" | "clustering";
    dimensions?: number;
};

export async function callCohereAzureEmbed(
    env: CloudflareBindings,
    modelId: string,
    input: string[],
    dimensions?: number,
    inputType: CohereAzureEmbeddingRequest["input_type"] = "document",
): Promise<OpenAIEmbeddingResponse> {
    const apiKey = env.AZURE_MYCELI_PROD_API_KEY;

    if (!apiKey) {
        throw new Error("AZURE_MYCELI_PROD_API_KEY is not configured");
    }

    const body: CohereAzureEmbeddingRequest = {
        model: modelId,
        input,
        input_type: inputType,
        ...(dimensions ? { dimensions } : {}),
    };

    const response = await fetch(COHERE_AZURE_ENDPOINT, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "api-key": apiKey,
        },
        body: JSON.stringify(body),
    });

    await ensureUpstreamOk(response, COHERE_AZURE_ENDPOINT);
    return response.json() as Promise<OpenAIEmbeddingResponse>;
}

export function extractCohereAzureUsage(
    response: OpenAIEmbeddingResponse,
): Usage {
    const promptTextTokens = response.usage?.prompt_tokens;

    if (typeof promptTextTokens !== "number") {
        throw new Error(
            "Cohere Azure embedding response is missing prompt_tokens",
        );
    }

    return { promptTextTokens };
}
