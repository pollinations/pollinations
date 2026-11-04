import { ensureUpstreamOk, UpstreamError } from "@shared/error.ts";
import { signBedrockHeaders } from "../text/auth/bedrock.ts";
import type { OpenAIEmbeddingResponse } from "./openai.ts";

export async function callCohereBedrockEmbed(
    env: CloudflareBindings,
    modelId: string,
    input: string[] | { image: string; text?: string },
    dimensions = 1536,
    inputType: "document" | "query" = "document",
): Promise<OpenAIEmbeddingResponse> {
    const region = env.AWS_REGION || "us-east-1";
    const url = new URL(
        `https://bedrock-runtime.${region}.amazonaws.com/model/${modelId}/invoke`,
    );
    const isText = Array.isArray(input);
    const body = JSON.stringify({
        // Azure's image endpoint produces document vectors for both input types.
        input_type:
            isText && inputType === "query"
                ? "search_query"
                : "search_document",
        embedding_types: ["float"],
        output_dimension: dimensions,
        ...(isText
            ? { texts: input }
            : input.text
              ? {
                    inputs: [
                        {
                            content: [
                                { type: "text", text: input.text },
                                {
                                    type: "image_url",
                                    image_url: { url: input.image },
                                },
                            ],
                        },
                    ],
                }
              : { images: [input.image] }),
    });
    const headers = await signBedrockHeaders(
        url,
        body,
        { "content-type": "application/json" },
        {
            accessKeyId: env.AWS_ACCESS_KEY_ID,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
            region,
        },
    );
    const response = await fetch(url, { method: "POST", headers, body }).catch(
        (cause: unknown) => {
            throw new UpstreamError(502, {
                message: "Cohere Bedrock request failed",
                requestUrl: url,
                cause,
            });
        },
    );
    await ensureUpstreamOk(response, url.toString());
    const reportedTokens = response.headers.get(
        "x-amzn-bedrock-input-token-count",
    );
    const promptTokens = Number(reportedTokens);
    if (
        !reportedTokens?.trim() ||
        !Number.isSafeInteger(promptTokens) ||
        promptTokens < 0
    ) {
        throw new UpstreamError(502, {
            message:
                "Cohere Bedrock embedding response is missing valid input token usage",
            requestUrl: url,
        });
    }
    const result = (await response.json()) as {
        embeddings: number[][] | { float: number[][] };
    };
    const embeddings = Array.isArray(result.embeddings)
        ? result.embeddings
        : result.embeddings.float;
    return {
        object: "list",
        data: embeddings.map((embedding, index) => ({
            object: "embedding",
            embedding,
            index,
        })),
        usage: { prompt_tokens: promptTokens, total_tokens: promptTokens },
    };
}
