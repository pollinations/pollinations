import type { ModelDefinition, Usage } from "@shared/registry/registry.ts";
import { buildUsageHeaders } from "@shared/registry/usage-headers.ts";
import { callAzureEmbed, extractAzureUsage } from "./azure.ts";
import {
    badRequest,
    inputToGeminiParts,
    inputToText,
    normalizeInputs,
} from "./input.ts";
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

const AZURE_DIMENSION_RULES: Record<
    string,
    { allowed?: Set<number>; max?: number; description: string }
> = {
    "text-embedding-3-small": {
        max: 1536,
        description: "up to 1536",
    },
    "text-embedding-3-large": {
        max: 3072,
        description: "up to 3072",
    },
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

    if (serviceDef.provider === "azure") {
        return await generateAzureEmbeddings(env, request, responseModel);
    }

    throw new Error(`Unsupported embeddings provider: ${serviceDef.provider}`);
}

async function generateGeminiEmbeddings(
    env: CloudflareBindings,
    request: EmbeddingRequest,
    responseModel: string,
): Promise<Response> {
    syncGoogleEnvironment(env);
    const inputs = normalizeInputs(request.input);
    const aggregatedUsage: Usage = {};

    const data = await Promise.all(
        inputs.map(async (singleInput, index) => {
            const parts = await inputToGeminiParts(singleInput);
            const result = await callGeminiEmbed(
                request.model,
                parts,
                request.task_type,
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

async function generateAzureEmbeddings(
    env: CloudflareBindings,
    request: EmbeddingRequest,
    responseModel: string,
): Promise<Response> {
    if (request.task_type) {
        badRequest("task_type is only supported by Gemini embedding models");
    }

    validateAzureDimensions(request, responseModel);

    const inputs = normalizeInputs(request.input);
    const textInputs = inputs.map(inputToText);

    if (textInputs.length === 0) {
        return embeddingsResponse(responseModel, [], { promptTextTokens: 0 });
    }

    const result = await callAzureEmbed(
        env,
        request.model,
        textInputs,
        request.dimensions,
    );
    const usage = extractAzureUsage(result);

    const data = [...result.data]
        .sort((a, b) => a.index - b.index)
        .map(({ embedding, index }) => ({
            object: "embedding" as const,
            embedding: encodeEmbedding(embedding, request.encoding_format),
            index,
        }));

    return embeddingsResponse(responseModel, data, usage);
}

function validateAzureDimensions(
    request: EmbeddingRequest,
    responseModel: string,
) {
    if (!request.dimensions) return;

    const rule = AZURE_DIMENSION_RULES[request.model];

    if (!rule) return;

    if (rule.allowed && !rule.allowed.has(request.dimensions)) {
        badRequest(`${responseModel} supports dimensions ${rule.description}`);
    }

    if (rule.max && request.dimensions > rule.max) {
        badRequest(`${responseModel} supports dimensions ${rule.description}`);
    }
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
