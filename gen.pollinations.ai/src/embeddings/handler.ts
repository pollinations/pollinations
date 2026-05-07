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
    const inputs = normalizeInputs(request.input);

    const results = await Promise.all(
        inputs.map(async (singleInput, index) => {
            const parts = await inputToGeminiParts(singleInput);
            const result = await callGeminiEmbed(
                request.model,
                parts,
                request.task_type,
                request.dimensions,
            );
            const values = result.embedding.values;
            return {
                object: "embedding" as const,
                embedding:
                    request.encoding_format === "base64"
                        ? Buffer.from(new Float32Array(values).buffer).toString(
                              "base64",
                          )
                        : values,
                index,
                usage: extractModalityUsage(result),
            };
        }),
    );

    const aggregatedUsage: Usage = {};
    let promptTokens = 0;
    for (const r of results) {
        for (const [key, value] of Object.entries(r.usage) as [
            keyof Usage,
            number,
        ][]) {
            aggregatedUsage[key] = (aggregatedUsage[key] ?? 0) + value;
            promptTokens += value;
        }
    }

    return new Response(
        JSON.stringify({
            object: "list",
            data: results.map(({ object, embedding, index }) => ({
                object,
                embedding,
                index,
            })),
            model: responseModel,
            usage: { prompt_tokens: promptTokens, total_tokens: promptTokens },
        }),
        {
            headers: {
                "Content-Type": "application/json",
                ...buildUsageHeaders(responseModel, aggregatedUsage),
            },
        },
    );
}
