import {
    type CommunityEndpointRuntime,
    communityEmbeddingsUrl,
    normalizeCommunityEndpointBearerToken,
} from "@shared/community-endpoints.ts";
import { ensureUpstreamOk, UpstreamError } from "@shared/error.ts";
import {
    buildUsageHeaders,
    getOpenAIEmbeddingUsage,
} from "@shared/registry/usage-headers.ts";
import { decryptSecret } from "@shared/secret-encryption.ts";
import { CreateEmbeddingResponseSchema } from "@/schemas/embeddings.ts";
import { badRequest, inputToText, normalizeInputs } from "./input.ts";
import type { EmbeddingRequest } from "./types.ts";

const REQUEST_TIMEOUT_MS = 120_000;

export async function generateCommunityEmbeddings(
    endpoint: CommunityEndpointRuntime,
    request: EmbeddingRequest,
    responseModel: string,
    secret: string,
): Promise<Response> {
    if (request.task_type) {
        badRequest("task_type is not supported by community embedding models");
    }

    const inputs = normalizeInputs(request.input).map(inputToText);
    if (inputs.length === 0) {
        return embeddingResponse(responseModel, [], 0);
    }

    const bearerToken = await decryptSecret(
        endpoint.bearerTokenCiphertext,
        secret,
    );
    const upstreamUrl = communityEmbeddingsUrl(endpoint.baseUrl);
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
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch (error) {
        throw new UpstreamError(502, {
            message:
                "Community embedding endpoint timed out or could not connect",
            requestUrl: new URL(upstreamUrl),
            cause: error,
        });
    }

    await ensureUpstreamOk(response, upstreamUrl);
    const body = await response.json().catch(() => null);
    const usage = getOpenAIEmbeddingUsage(body);
    if (!usage || usage.prompt_tokens <= 0) {
        throw invalidResponse(
            upstreamUrl,
            "Community embedding endpoint did not return billable OpenAI token usage",
        );
    }

    const parsed = CreateEmbeddingResponseSchema.safeParse({
        ...(body && typeof body === "object" ? body : {}),
        model: responseModel,
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

    return embeddingResponse(responseModel, data, usage.prompt_tokens);
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

function embeddingResponse(
    model: string,
    data: unknown[],
    promptTokens: number,
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
            headers: buildUsageHeaders(model, {
                promptTextTokens: promptTokens,
            }),
        },
    );
}

function invalidResponse(url: string, message: string): UpstreamError {
    return new UpstreamError(502, {
        message,
        requestUrl: new URL(url),
    });
}
