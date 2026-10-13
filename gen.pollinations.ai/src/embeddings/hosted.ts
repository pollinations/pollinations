import { ensureUpstreamOk, UpstreamError } from "@shared/error.ts";
import type { Usage } from "@shared/registry/registry.ts";
import type { OpenAIEmbeddingResponse } from "./openai.ts";

const ENDPOINTS = {
    fireworks: "https://api.fireworks.ai/inference/v1/embeddings",
    deepinfra: "https://api.deepinfra.com/v1/openai/embeddings",
};

type HostedEmbeddingRequest = {
    model: string;
    input: string[];
    dimensions?: number;
};

export async function callHostedEmbed(
    env: CloudflareBindings,
    provider: keyof typeof ENDPOINTS,
    modelId: string,
    input: string[],
    dimensions?: number,
): Promise<OpenAIEmbeddingResponse> {
    // The declared Fireworks fallback preserves inputs DeepInfra cannot serve.
    if (
        provider === "deepinfra" &&
        input.some((text) => text.length >= 131072)
    ) {
        throw new UpstreamError(503, {
            message: "DeepInfra requires inputs shorter than 131072 characters",
        });
    }
    const secretName =
        provider === "deepinfra"
            ? "DEEPINFRA_API_KEY"
            : "FIREWORKS_NEO_API_KEY";
    const apiKey = env[secretName];
    const endpoint = ENDPOINTS[provider];

    if (!apiKey) {
        throw new Error(`${secretName} is not configured`);
    }

    const body: HostedEmbeddingRequest = {
        model: modelId,
        input,
        ...(dimensions ? { dimensions } : {}),
    };

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
    });

    await ensureUpstreamOk(response, endpoint);
    return response.json() as Promise<OpenAIEmbeddingResponse>;
}

export function extractHostedUsage(response: OpenAIEmbeddingResponse): Usage {
    const promptTextTokens = response.usage?.prompt_tokens;

    if (typeof promptTextTokens !== "number") {
        throw new Error("Hosted embedding response is missing prompt_tokens");
    }

    return { promptTextTokens };
}
