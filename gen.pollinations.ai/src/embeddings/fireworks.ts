import type { Usage } from "@shared/registry/registry.ts";

import { ensureUpstreamOk } from "@/error.ts";
import type { OpenAIEmbeddingResponse } from "./openai.ts";

const FIREWORKS_EMBEDDINGS_ENDPOINT =
    "https://api.fireworks.ai/inference/v1/embeddings";

type FireworksEmbeddingRequest = {
    model: string;
    input: string[];
    dimensions?: number;
};

export async function callFireworksEmbed(
    env: CloudflareBindings,
    modelId: string,
    input: string[],
    dimensions?: number,
): Promise<OpenAIEmbeddingResponse> {
    const apiKey = env.FIREWORKS_API_KEY;

    if (!apiKey) {
        throw new Error("FIREWORKS_API_KEY is not configured");
    }

    const body: FireworksEmbeddingRequest = {
        model: modelId,
        input,
        ...(dimensions ? { dimensions } : {}),
    };

    const response = await fetch(FIREWORKS_EMBEDDINGS_ENDPOINT, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
    });

    await ensureUpstreamOk(response, FIREWORKS_EMBEDDINGS_ENDPOINT);
    return response.json() as Promise<OpenAIEmbeddingResponse>;
}

export function extractFireworksUsage(
    response: OpenAIEmbeddingResponse,
): Usage {
    const promptTextTokens = response.usage?.prompt_tokens;

    if (typeof promptTextTokens !== "number") {
        throw new Error(
            "Fireworks embedding response is missing prompt_tokens",
        );
    }

    return { promptTextTokens };
}
