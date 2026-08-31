import {
    COMMUNITY_ENDPOINT_TIMEOUT_MS,
    type CommunityEndpointRuntime,
    communityEmbeddingData,
    communityEmbeddingsUrl,
    MAX_COMMUNITY_EMBEDDING_RESPONSE_BYTES,
    maxCommunityEmbeddingPromptTokens,
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
import { badRequest, inputToText, normalizeInputs } from "./input.ts";
import type { EmbeddingRequest } from "./types.ts";

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
    const data = communityEmbeddingData(
        body,
        inputs.length,
        request.encoding_format,
        request.dimensions,
    );
    if (!data) {
        throw invalidResponse(
            upstreamUrl,
            "Community embedding endpoint returned invalid embedding data",
        );
    }

    if (
        !usage ||
        typeof usage.prompt_tokens !== "number" ||
        usage.prompt_tokens <= 0 ||
        usage.prompt_tokens > maxCommunityEmbeddingPromptTokens(inputs)
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
