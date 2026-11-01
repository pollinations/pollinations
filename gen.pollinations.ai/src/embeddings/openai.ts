import { ensureUpstreamOk } from "@shared/error.ts";
import type { Usage } from "@shared/registry/registry.ts";

const AZURE_OPENAI_EMBEDDINGS_ENDPOINT =
    "https://myceli-prod-eastus.cognitiveservices.azure.com/openai/v1/embeddings";

type OpenAIEmbeddingRequest = {
    model: string;
    input: string[];
    dimensions?: number;
};

type OpenAIEmbeddingData = {
    object: "embedding";
    embedding: number[];
    index: number;
};

export type OpenAIEmbeddingResponse = {
    object: "list";
    data: OpenAIEmbeddingData[];
    model?: string;
    usage?: {
        prompt_tokens?: number;
        total_tokens?: number;
    };
};

export async function callOpenAIEmbed(
    env: CloudflareBindings,
    modelId: string,
    input: string[],
    dimensions: number | undefined,
    provider: "azure" | "openai",
): Promise<OpenAIEmbeddingResponse> {
    const keyName =
        provider === "azure" ? "AZURE_MYCELI_PROD_API_KEY" : "OPENAI_API_KEY";
    const apiKey = env[keyName];
    const endpoint =
        provider === "azure"
            ? AZURE_OPENAI_EMBEDDINGS_ENDPOINT
            : "https://api.openai.com/v1/embeddings";

    if (!apiKey) {
        throw new Error(`${keyName} is not configured`);
    }

    const body: OpenAIEmbeddingRequest = {
        model: modelId,
        input,
        ...(dimensions ? { dimensions } : {}),
    };

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            ...(provider === "azure"
                ? { "api-key": apiKey }
                : { authorization: `Bearer ${apiKey}` }),
        },
        body: JSON.stringify(body),
    });

    await ensureUpstreamOk(response, endpoint);
    return response.json() as Promise<OpenAIEmbeddingResponse>;
}

export function extractOpenAIUsage(response: OpenAIEmbeddingResponse): Usage {
    const promptTextTokens = response.usage?.prompt_tokens;

    if (typeof promptTextTokens !== "number") {
        throw new Error("OpenAI embedding response is missing prompt_tokens");
    }

    return { promptTextTokens };
}
