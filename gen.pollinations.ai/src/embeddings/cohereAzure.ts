import { ensureUpstreamOk } from "@shared/error.ts";
import type { Usage } from "@shared/registry/registry.ts";
import type { OpenAIEmbeddingResponse } from "./openai.ts";

const COHERE_AZURE_ROUTES = {
    "cohere-embed-v4": {
        host: "https://myceli-prod-eastus.cognitiveservices.azure.com",
        key: "AZURE_MYCELI_PROD_API_KEY",
    },
    "cohere-embed-v4-azure-sweden": {
        host: "https://myceli-prod-swedencentral.cognitiveservices.azure.com",
        key: "AZURE_MYCELI_PROD_SWEDEN_API_KEY",
    },
} as const;
// This Cohere deployment exposes image embeddings only on this Azure preview
// contract; the 2025-04-01 image route returns 404.
const COHERE_AZURE_IMAGE_ENDPOINT =
    "/models/images/embeddings?api-version=2024-05-01-preview";

type CohereAzureInputType = "document" | "query";

type CohereAzureEmbeddingRequest = {
    model: string;
    input: string[];
    input_type: CohereAzureInputType;
    dimensions?: number;
};

type CohereAzureImageEmbeddingRequest = {
    model: string;
    input: { image: string; text?: string }[];
    input_type: CohereAzureInputType;
    dimensions?: number;
};

export async function callCohereAzureEmbed(
    env: CloudflareBindings,
    routeId: string,
    modelId: string,
    input: string[],
    dimensions?: number,
    inputType: CohereAzureEmbeddingRequest["input_type"] = "document",
): Promise<OpenAIEmbeddingResponse> {
    const body: CohereAzureEmbeddingRequest = {
        model: modelId,
        input,
        input_type: inputType,
        ...(dimensions ? { dimensions } : {}),
    };

    return callCohereAzure(env, routeId, "/openai/v1/embeddings", body);
}

export async function callCohereAzureImageEmbed(
    env: CloudflareBindings,
    routeId: string,
    modelId: string,
    input: CohereAzureImageEmbeddingRequest["input"],
    dimensions?: number,
    inputType: CohereAzureInputType = "document",
): Promise<OpenAIEmbeddingResponse> {
    const body: CohereAzureImageEmbeddingRequest = {
        model: modelId,
        input,
        input_type: inputType,
        ...(dimensions ? { dimensions } : {}),
    };

    return callCohereAzure(env, routeId, COHERE_AZURE_IMAGE_ENDPOINT, body);
}

async function callCohereAzure(
    env: CloudflareBindings,
    routeId: string,
    path: string,
    body: CohereAzureEmbeddingRequest | CohereAzureImageEmbeddingRequest,
): Promise<OpenAIEmbeddingResponse> {
    const route =
        COHERE_AZURE_ROUTES[routeId as keyof typeof COHERE_AZURE_ROUTES];
    const endpoint = `${route.host}${path}`;
    const apiKey = env[route.key];
    if (!apiKey) {
        throw new Error(`${route.key} is not configured`);
    }

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "api-key": apiKey,
        },
        body: JSON.stringify(body),
    });

    await ensureUpstreamOk(response, endpoint);
    return response.json() as Promise<OpenAIEmbeddingResponse>;
}

export function extractCohereAzureUsage(
    response: OpenAIEmbeddingResponse,
    modality: "text" | "image" = "text",
): Usage {
    const promptTokens = response.usage?.prompt_tokens;

    if (typeof promptTokens !== "number") {
        throw new Error(
            "Cohere Azure embedding response is missing prompt_tokens",
        );
    }

    // Azure reports one aggregate count for image requests, including any
    // accompanying text, so the complete request is billed at the image rate.
    return modality === "image"
        ? { promptImageTokens: promptTokens }
        : { promptTextTokens: promptTokens };
}
