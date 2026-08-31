import {
    COMMUNITY_ENDPOINT_TIMEOUT_MS,
    type CommunityEndpointRuntime,
    communityEmbeddingsUrl,
    normalizeCommunityEndpointBearerToken,
} from "@shared/community-endpoints.ts";
import { ensureUpstreamOk, UpstreamError } from "@shared/error.ts";
import type { Usage } from "@shared/registry/registry.ts";
import {
    buildUsageHeaders,
    getOpenAIEmbeddingUsage,
} from "@shared/registry/usage-headers.ts";
import { readResponseText } from "@shared/response-bytes.ts";
import { decryptSecret } from "@shared/secret-encryption.ts";
import { CreateEmbeddingResponseSchema } from "@/schemas/embeddings.ts";
import { badRequest, inputToText, normalizeInputs } from "./input.ts";
import type { EmbeddingRequest } from "./types.ts";

// Covers the public maximum of 32 inputs × 4096 JSON float values with margin.
const MAX_COMMUNITY_EMBEDDING_RESPONSE_BYTES = 4 * 1024 * 1024;

export async function generateCommunityEmbeddings(
    endpoint: CommunityEndpointRuntime,
    request: EmbeddingRequest,
    responseModel: string,
    secret: string,
): Promise<Response> {
    if (request.task_type) {
        badRequest("task_type is not supported by community embedding models");
    }
    if (request.input_type) {
        badRequest("input_type is not supported by community embedding models");
    }

    const inputs = normalizeInputs(request.input).map(inputToText);
    if (inputs.length === 0) {
        return embeddingResponse(responseModel, [], 0, {});
    }

    const upstreamUrl = communityEmbeddingsUrl(endpoint.baseUrl);

    // Managed agents are text-only, so an embedding endpoint is always
    // external and carries an upstream bearer credential.
    if (endpoint.type !== "proxy") {
        throw new UpstreamError(502, {
            message: `Community embedding endpoint '${endpoint.modelId}' is a managed agent`,
            requestUrl: new URL(upstreamUrl),
        });
    }

    const bearerToken = await decryptSecret(
        endpoint.bearerTokenCiphertext,
        secret,
    );
    let response: Response;
    try {
        response = await fetch(upstreamUrl, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${normalizeCommunityEndpointBearerToken(
                    bearerToken,
                )}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: endpoint.upstreamModel,
                input: inputs,
                encoding_format: request.encoding_format,
                ...(request.dimensions
                    ? { dimensions: request.dimensions }
                    : {}),
            }),
            redirect: "manual",
            signal: AbortSignal.timeout(COMMUNITY_ENDPOINT_TIMEOUT_MS),
        });
    } catch (error) {
        throw new UpstreamError(502, {
            message:
                "Community embedding endpoint timed out or could not connect",
            requestUrl: new URL(upstreamUrl),
            cause: error,
        });
    }

    const responseText = await readResponseText(
        response,
        MAX_COMMUNITY_EMBEDDING_RESPONSE_BYTES,
        () =>
            invalidResponse(
                upstreamUrl,
                "Community embedding endpoint response is too large",
            ),
    );
    await ensureUpstreamOk(response, upstreamUrl, responseText);
    const body = parseJson(responseText);
    const usage = getOpenAIEmbeddingUsage(body);

    const parsed = CreateEmbeddingResponseSchema.safeParse({
        ...(body && typeof body === "object" ? body : {}),
        model: responseModel,
        usage: usage ?? { prompt_tokens: 0, total_tokens: 0 },
    });
    if (!parsed.success) {
        throw invalidResponse(
            upstreamUrl,
            "Community embedding endpoint returned an invalid OpenAI response",
        );
    }

    const data = [...parsed.data.data].sort((a, b) => a.index - b.index);
    const expectedEncoding = request.encoding_format === "base64";
    if (
        data.length !== inputs.length ||
        data.some(
            (item, index) =>
                item.index !== index ||
                !isValidEmbedding(
                    item.embedding,
                    expectedEncoding,
                    request.dimensions,
                ),
        )
    ) {
        throw invalidResponse(
            upstreamUrl,
            "Community embedding endpoint returned invalid embedding data",
        );
    }

    // A tokenizer cannot produce more prompt tokens than UTF-8 bytes plus a
    // small per-input allowance for model-added special tokens.
    const maxPromptTokens = inputs.reduce(
        (total, input) =>
            total + new TextEncoder().encode(input).byteLength + 16,
        0,
    );
    if (
        !usage ||
        typeof usage.prompt_tokens !== "number" ||
        usage.prompt_tokens <= 0 ||
        usage.prompt_tokens > maxPromptTokens
    ) {
        throw invalidResponse(
            upstreamUrl,
            "Community embedding endpoint returned invalid prompt token usage for billing",
        );
    }
    const billableUsage: Usage = { promptTextTokens: usage.prompt_tokens };
    return embeddingResponse(
        responseModel,
        data,
        usage.prompt_tokens,
        billableUsage,
    );
}

function isValidEmbedding(
    embedding: number[] | string,
    base64: boolean,
    dimensions?: number,
): boolean {
    if (!base64) {
        return (
            Array.isArray(embedding) &&
            embedding.length > 0 &&
            (!dimensions || embedding.length === dimensions)
        );
    }
    if (typeof embedding !== "string" || embedding.length === 0) return false;
    try {
        const byteLength = atob(embedding).length;
        return (
            byteLength > 0 &&
            byteLength % 4 === 0 &&
            (!dimensions || byteLength === dimensions * 4)
        );
    } catch {
        return false;
    }
}

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function embeddingResponse(
    model: string,
    data: unknown[],
    promptTokens: number,
    billableUsage: Usage,
): Response {
    return Response.json(
        {
            object: "list",
            data,
            model,
            usage: {
                prompt_tokens: promptTokens,
                total_tokens: promptTokens,
            },
        },
        {
            headers: buildUsageHeaders(model, billableUsage),
        },
    );
}

function invalidResponse(url: string, message: string): UpstreamError {
    return new UpstreamError(502, {
        message,
        requestUrl: new URL(url),
    });
}
