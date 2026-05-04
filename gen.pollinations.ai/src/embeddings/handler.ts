import type { Usage } from "@shared/registry/registry.ts";
import { buildUsageHeaders } from "@shared/registry/usage-headers.ts";
import { inputToGeminiParts, normalizeInputs } from "./input.ts";
import type { EmbeddingRequest } from "./types.ts";
import {
    callGeminiEmbed,
    extractModalityUsage,
    syncGoogleEnvironment,
} from "./vertex.ts";

export async function generateEmbeddings(
    env: CloudflareBindings,
    request: EmbeddingRequest,
    responseModel: string = request.model,
): Promise<Response> {
    syncGoogleEnvironment(env);
    const { model, input, dimensions, task_type } = request;
    const modelId = model;

    const inputs = normalizeInputs(input);

    if (inputs.length === 0) {
        return new Response(
            JSON.stringify({
                object: "list",
                data: [],
                model: responseModel,
                usage: { prompt_tokens: 0, total_tokens: 0 },
            }),
            {
                headers: {
                    "Content-Type": "application/json",
                    "x-model-used": responseModel,
                },
            },
        );
    }

    // Process in chunks to avoid saturating Vertex AI with concurrent requests
    const EMBED_CONCURRENCY = 10;
    const results: {
        object: "embedding";
        embedding: number[];
        index: number;
        usage: Usage;
    }[] = [];
    for (let i = 0; i < inputs.length; i += EMBED_CONCURRENCY) {
        const chunk = inputs.slice(i, i + EMBED_CONCURRENCY);
        const chunkResults = await Promise.all(
            chunk.map(async (singleInput, j) => {
                const parts = await inputToGeminiParts(singleInput);
                const result = await callGeminiEmbed(
                    env,
                    modelId,
                    parts,
                    task_type,
                    dimensions,
                );
                return {
                    object: "embedding" as const,
                    embedding: result.embedding.values,
                    index: i + j,
                    usage: extractModalityUsage(result),
                };
            }),
        );
        results.push(...chunkResults);
    }

    const embeddings = results.map(({ object, embedding, index }) => ({
        object,
        embedding,
        index,
    }));

    const aggregatedUsage: Usage = {};
    for (const r of results) {
        for (const [key, value] of Object.entries(r.usage) as [
            keyof Usage,
            number | undefined,
        ][]) {
            if (value) {
                aggregatedUsage[key] = (aggregatedUsage[key] ?? 0) + value;
            }
        }
    }
    const promptTokens = Object.values(aggregatedUsage).reduce(
        (s, v) => s + (v ?? 0),
        0,
    );

    const usageHeaders = buildUsageHeaders(responseModel, aggregatedUsage);

    const responseBody = {
        object: "list",
        data: embeddings,
        model: responseModel,
        usage: {
            prompt_tokens: promptTokens,
            total_tokens: promptTokens,
        },
    };

    return new Response(JSON.stringify(responseBody), {
        headers: {
            "Content-Type": "application/json",
            ...usageHeaders,
        },
    });
}
