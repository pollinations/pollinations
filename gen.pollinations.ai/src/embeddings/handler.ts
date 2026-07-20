import type { EmbeddingServiceId } from "@shared/registry/embeddings.ts";
import type { ModelDefinition, Usage } from "@shared/registry/registry.ts";
import { buildUsageHeaders } from "@shared/registry/usage-headers.ts";
import {
    callCohereAzureEmbed,
    callCohereAzureImageEmbed,
    extractCohereAzureUsage,
} from "./cohereAzure.ts";
import { callFireworksEmbed, extractFireworksUsage } from "./fireworks.ts";
import {
    applyGeminiTaskInstruction,
    badRequest,
    inputToCohereImage,
    inputToGeminiParts,
    inputToText,
    normalizeInputs,
} from "./input.ts";
import { callOpenAIEmbed, extractOpenAIUsage } from "./openai.ts";
import type { EmbeddingRequest } from "./types.ts";
import {
    callGeminiEmbed,
    extractModalityUsage,
    syncGoogleEnvironment,
} from "./vertex.ts";

type EmbeddingData = {
    object: "embedding";
    embedding: number[] | string;
    index: number;
};

// Provider-facing model IDs (what the upstream APIs expect), keyed by
// registry model name. The registry only carries public names and pricing.
const EMBEDDING_PROVIDER_MODEL_IDS: Record<EmbeddingServiceId, string> = {
    "gemini-2": "gemini-embedding-2",
    "openai-3-small": "text-embedding-3-small",
    "openai-3-large": "text-embedding-3-large",
    "cohere-embed-v4": "embed-v-4-0",
    "qwen3-embedding-8b": "accounts/fireworks/models/qwen3-embedding-8b",
};

export function getEmbeddingProviderModelId(modelName: string): string {
    const modelId =
        EMBEDDING_PROVIDER_MODEL_IDS[modelName as EmbeddingServiceId];
    if (!modelId) {
        throw new Error(
            `No provider model ID configured for embedding model: ${modelName}`,
        );
    }
    return modelId;
}

const EMBEDDING_DIMENSIONS: Record<
    EmbeddingServiceId,
    { max: number; allowed?: readonly number[] }
> = {
    "gemini-2": { max: 3072 },
    "openai-3-small": { max: 1536 },
    "openai-3-large": { max: 3072 },
    "cohere-embed-v4": { max: 1536, allowed: [256, 512, 1024, 1536] },
    "qwen3-embedding-8b": { max: 4096 },
};

export async function generateEmbeddings(
    env: CloudflareBindings,
    request: EmbeddingRequest,
    serviceDef: ModelDefinition,
    responseModel: string = request.model,
): Promise<Response> {
    if (serviceDef.provider === "google") {
        return await generateGeminiEmbeddings(env, request, responseModel);
    }

    if (serviceDef.provider === "openai") {
        return await generateOpenAIEmbeddings(env, request, responseModel);
    }

    if (serviceDef.provider === "azure") {
        return await generateCohereAzureEmbeddings(env, request, responseModel);
    }

    if (serviceDef.provider === "fireworks") {
        return await generateFireworksEmbeddings(env, request, responseModel);
    }

    throw new Error(`Unsupported embeddings provider: ${serviceDef.provider}`);
}

async function generateCohereAzureEmbeddings(
    env: CloudflareBindings,
    request: EmbeddingRequest,
    responseModel: string,
): Promise<Response> {
    validateDimensions(request.dimensions, responseModel);
    if (request.task_type) {
        badRequest("task_type is only supported by Gemini embedding models");
    }

    const inputs = normalizeInputs(request.input);
    const imageInput =
        inputs.length === 1 ? await inputToCohereImage(inputs[0]) : undefined;

    if (imageInput) {
        const result = await callCohereAzureImageEmbed(
            env,
            request.model,
            [imageInput],
            request.dimensions,
            request.input_type,
        );
        return cohereEmbeddingsResponse(
            result,
            request,
            responseModel,
            "image",
        );
    }

    const textInputs = inputs.map(inputToText);

    if (textInputs.length === 0) {
        return embeddingsResponse(responseModel, [], { promptTextTokens: 0 });
    }

    const result = await callCohereAzureEmbed(
        env,
        request.model,
        textInputs,
        request.dimensions,
        request.input_type,
    );
    return cohereEmbeddingsResponse(result, request, responseModel, "text");
}

async function generateFireworksEmbeddings(
    env: CloudflareBindings,
    request: EmbeddingRequest,
    responseModel: string,
): Promise<Response> {
    validateDimensions(request.dimensions, responseModel);
    if (request.task_type) {
        badRequest("task_type is only supported by Gemini embedding models");
    }
    rejectUnsupportedInputType(request);

    const inputs = normalizeInputs(request.input);
    const textInputs = inputs.map(inputToText);

    if (textInputs.length === 0) {
        return embeddingsResponse(responseModel, [], { promptTextTokens: 0 });
    }

    const result = await callFireworksEmbed(
        env,
        request.model,
        textInputs,
        request.dimensions,
    );
    const usage = extractFireworksUsage(result);

    const data = [...result.data]
        .sort((a, b) => a.index - b.index)
        .map(({ embedding, index }) => ({
            object: "embedding" as const,
            embedding: encodeEmbedding(embedding, request.encoding_format),
            index,
        }));

    return embeddingsResponse(responseModel, data, usage);
}

async function generateGeminiEmbeddings(
    env: CloudflareBindings,
    request: EmbeddingRequest,
    responseModel: string,
): Promise<Response> {
    validateDimensions(request.dimensions, responseModel);
    rejectUnsupportedInputType(request);
    syncGoogleEnvironment(env);
    const inputs = normalizeInputs(request.input);
    const aggregatedUsage: Usage = {};

    const data = await Promise.all(
        inputs.map(async (singleInput, index) => {
            const parts = applyGeminiTaskInstruction(
                await inputToGeminiParts(singleInput),
                request.task_type,
            );
            const result = await callGeminiEmbed(
                request.model,
                parts,
                request.dimensions,
            );
            const usage = extractModalityUsage(result);

            addUsage(aggregatedUsage, usage);

            return {
                object: "embedding" as const,
                embedding: encodeEmbedding(
                    result.embedding.values,
                    request.encoding_format,
                ),
                index,
            };
        }),
    );

    return embeddingsResponse(responseModel, data, aggregatedUsage);
}

async function generateOpenAIEmbeddings(
    env: CloudflareBindings,
    request: EmbeddingRequest,
    responseModel: string,
): Promise<Response> {
    validateDimensions(request.dimensions, responseModel);
    if (request.task_type) {
        badRequest("task_type is only supported by Gemini embedding models");
    }
    rejectUnsupportedInputType(request);

    const inputs = normalizeInputs(request.input);
    const textInputs = inputs.map(inputToText);

    if (textInputs.length === 0) {
        return embeddingsResponse(responseModel, [], { promptTextTokens: 0 });
    }

    const result = await callOpenAIEmbed(
        env,
        request.model,
        textInputs,
        request.dimensions,
    );
    const usage = extractOpenAIUsage(result);

    const data = [...result.data]
        .sort((a, b) => a.index - b.index)
        .map(({ embedding, index }) => ({
            object: "embedding" as const,
            embedding: encodeEmbedding(embedding, request.encoding_format),
            index,
        }));

    return embeddingsResponse(responseModel, data, usage);
}

function validateDimensions(
    dimensions: number | undefined,
    responseModel: string,
) {
    if (!dimensions) return;

    const constraints =
        EMBEDDING_DIMENSIONS[responseModel as EmbeddingServiceId];
    if (!constraints) return;

    if (dimensions > constraints.max) {
        badRequest(
            `${responseModel} supports dimensions up to ${constraints.max}`,
        );
    }

    if (constraints.allowed && !constraints.allowed.includes(dimensions)) {
        badRequest(
            `${responseModel} supports dimensions ${constraints.allowed.join(
                ", ",
            )}`,
        );
    }
}

function rejectUnsupportedInputType(request: EmbeddingRequest) {
    if (request.input_type) {
        badRequest("input_type is only supported by Cohere embedding models");
    }
}

function cohereEmbeddingsResponse(
    result: Awaited<ReturnType<typeof callCohereAzureEmbed>>,
    request: EmbeddingRequest,
    responseModel: string,
    modality: "text" | "image",
): Response {
    const usage = extractCohereAzureUsage(result, modality);
    const data = [...result.data]
        .sort((a, b) => a.index - b.index)
        .map(({ embedding, index }) => ({
            object: "embedding" as const,
            embedding: encodeEmbedding(embedding, request.encoding_format),
            index,
        }));

    return embeddingsResponse(responseModel, data, usage);
}

function encodeEmbedding(
    values: number[],
    encodingFormat: EmbeddingRequest["encoding_format"],
): number[] | string {
    if (encodingFormat === "base64") {
        return Buffer.from(new Float32Array(values).buffer).toString("base64");
    }

    return values;
}

function addUsage(target: Usage, usage: Usage) {
    for (const [key, value] of Object.entries(usage) as [
        keyof Usage,
        number,
    ][]) {
        target[key] = (target[key] ?? 0) + value;
    }
}

function embeddingsResponse(
    responseModel: string,
    data: EmbeddingData[],
    usage: Usage,
): Response {
    const promptTokens = Object.values(usage).reduce(
        (sum, value) => sum + value,
        0,
    );

    return new Response(
        JSON.stringify({
            object: "list",
            data,
            model: responseModel,
            usage: { prompt_tokens: promptTokens, total_tokens: promptTokens },
        }),
        {
            headers: {
                "Content-Type": "application/json",
                ...buildUsageHeaders(responseModel, usage),
            },
        },
    );
}
