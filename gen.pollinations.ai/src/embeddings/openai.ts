import type { Usage } from "@shared/registry/registry.ts";

import { ensureUpstreamOk } from "@/error.ts";

const OPENAI_EMBEDDINGS_ENDPOINT = "https://api.openai.com/v1/embeddings";

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
    dimensions?: number,
): Promise<OpenAIEmbeddingResponse> {
    const apiKey = env.OPENAI_API_KEY;

    if (!apiKey) {
        throw new Error("OPENAI_API_KEY is not configured");
    }

    const body: OpenAIEmbeddingRequest = {
        model: modelId,
        input,
        ...(dimensions ? { dimensions } : {}),
    };

    const response = await fetch(OPENAI_EMBEDDINGS_ENDPOINT, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
    });

    await ensureUpstreamOk(response, OPENAI_EMBEDDINGS_ENDPOINT);
    return response.json() as Promise<OpenAIEmbeddingResponse>;
}

export function extractOpenAIUsage(response: OpenAIEmbeddingResponse): Usage {
    const promptTextTokens = response.usage?.prompt_tokens;

    if (typeof promptTextTokens !== "number") {
        throw new Error("OpenAI embedding response is missing prompt_tokens");
    }

    return { promptTextTokens };
}
