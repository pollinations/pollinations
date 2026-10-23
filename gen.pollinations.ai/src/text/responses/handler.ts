import { UpstreamError } from "@shared/error.ts";
import {
    buildUsageHeaders,
    FALLBACK_TARGET_HEADER,
    hasExplicitPromptCacheHit,
    MODEL_USED_HEADER,
    PROMPT_CACHE_TYPE_HEADER,
    responsesUsageToUsage,
} from "@shared/registry/usage-headers.ts";
import {
    type CreateResponseRequest,
    CreateResponseResponseSchema,
    type ResponseUsage,
} from "@shared/schemas/openai.ts";
import type { Context } from "hono";
import type { Env } from "@/env.ts";
import { withSafetyHeaders } from "@/middleware/safety.ts";
import {
    type FallbackCandidate,
    fallbackCandidates,
    formatFallbackTarget,
    withModelFallback,
} from "../../fallback.ts";
import { textResponseStream } from "../../media/response-output.ts";
import { enforceModelRateLimit } from "../../utils/model-rate-limit.ts";
import { assertStreamContentType } from "../../utils/upstream-response.ts";
import { createPromptAgentResponsesClient } from "../agents/client.ts";
import { createCodeAgentResponsesClient } from "../agents/code-client.ts";
import { requireChatStreamUsage } from "../chat/usage.js";
import { communityEndpointModelConfig } from "../communityEndpoint.js";
import { syncTextEnvironment } from "../environment.js";
import { throwTextError } from "../errors.js";
import {
    supportsTextFallbackRequest,
    textCapabilityError,
} from "../fallbackCompatibility.js";
import { generateChatAttempt } from "../handler.ts";
import type { RequestData, ServiceError } from "../types.js";
import {
    chatCompletionToResponse,
    chatStreamToResponsesStream,
    responsesToChatRequest,
} from "./adaptedChat.js";
import {
    callDirectResponses,
    type DirectResponsesTarget,
    resolveDirectResponsesTarget,
    responsesTargetFromConfig,
} from "./client.js";
import {
    ResponsesInvalidRequestError,
    validateDirectResponsesRequest,
} from "./request.js";
import { applySafetyToResponseRequest } from "./safety.js";
import { requireResponsesStreamUsage } from "./stream.js";

type ResponsesContext = Context<Env>;

type DirectResponsesCandidate = FallbackCandidate & {
    responsesTarget?: DirectResponsesTarget;
    /** No Responses upstream: served through the Chat pipeline. */
    adapted?: true;
    originalIndex: number;
};

type DirectResponsesResult = Awaited<ReturnType<typeof callDirectResponses>> & {
    usage: ResponseUsage | null;
    /** Chat-shaped body for billing, exactly what Chat would track. */
    trackingBody?: ReadableStream | string;
};

function directResponsesCandidates(
    c: ResponsesContext,
    request: CreateResponseRequest,
): DirectResponsesCandidate[] {
    const targetFor = (
        candidate: FallbackCandidate,
    ): DirectResponsesTarget | null | undefined => {
        if (!candidate.communityEndpoint) {
            return resolveDirectResponsesTarget(candidate.id, request);
        }
        return candidate.communityEndpoint.api === "responses"
            ? undefined
            : null;
    };
    const supported: DirectResponsesCandidate[] = [];
    for (const [index, candidate] of fallbackCandidates(
        c.var.model,
    ).entries()) {
        if (
            index > 0 &&
            !supportsTextFallbackRequest(candidate.definition, request)
        ) {
            continue;
        }
        const target = targetFor(candidate);
        supported.push({
            ...candidate,
            ...(target ? { responsesTarget: target } : {}),
            ...(target === null ? { adapted: true as const } : {}),
            originalIndex: index,
        });
    }
    return supported;
}

async function responsesClientForAttempt(
    c: ResponsesContext,
    attempt: DirectResponsesCandidate,
): Promise<{ target: DirectResponsesTarget; fetcher?: typeof fetch }> {
    if (attempt.responsesTarget) return { target: attempt.responsesTarget };
    const endpoint = attempt.communityEndpoint;
    if (endpoint?.api !== "responses") {
        throw new ResponsesInvalidRequestError(
            `Model ${attempt.id} does not support the stateless Responses API`,
        );
    }
    const config = await communityEndpointModelConfig({
        endpoint,
        secret: c.env.BETTER_AUTH_SECRET,
        parentRequestId: c.get("requestId"),
        parentApiKeyId: c.var.auth?.apiKey?.id,
    });
    if (endpoint.type === "prompt_agent" || endpoint.type === "code_agent") {
        const apiKey = config.authKey;
        if (typeof apiKey !== "string" || !apiKey) {
            throw new Error("Managed agent request has no agent run token");
        }
        return endpoint.type === "prompt_agent"
            ? createPromptAgentResponsesClient(c, endpoint, apiKey)
            : createCodeAgentResponsesClient(c, endpoint, apiKey);
    }
    const target = responsesTargetFromConfig(endpoint.upstreamModel, config);
    if (!target) {
        throw new ResponsesInvalidRequestError(
            `Model ${attempt.id} does not support the stateless Responses API`,
        );
    }
    return { target };
}

/**
 * Run one candidate through the Chat pipeline. Billing reads the validated
 * Chat output, exactly as on /v1/chat/completions; the client gets Responses.
 */
async function callAdaptedChat(
    c: ResponsesContext,
    request: CreateResponseRequest,
    chatRequest: RequestData,
    attempt: DirectResponsesCandidate,
): Promise<DirectResponsesResult> {
    const completion = await generateChatAttempt(c, chatRequest, attempt);
    const requestUrl = completion.upstreamRequestUrl ?? new URL(c.req.url);
    if (request.stream) {
        if (!completion.responseStream) {
            throw new UpstreamError(502, {
                message: "Text model returned an empty stream",
                requestUrl,
            });
        }
        const [client, tracking] = requireChatStreamUsage(
            completion.responseStream,
        ).tee();
        return {
            response: new Response(
                chatStreamToResponsesStream(client, request, attempt.id),
            ),
            requestUrl,
            usage: null,
            trackingBody: tracking,
        };
    }
    const data = chatCompletionToResponse(request, attempt.id, completion);
    return {
        response: Response.json(data),
        requestUrl,
        usage: data.usage,
        trackingBody: JSON.stringify(completion),
    };
}

async function handleDirectResponse(
    c: ResponsesContext,
    request: CreateResponseRequest,
): Promise<Response> {
    syncTextEnvironment(c.env);

    try {
        const capabilityError = textCapabilityError(
            c.var.model.definition,
            request,
            c.var.model.communityEndpoint,
        );
        if (capabilityError)
            throw new ResponsesInvalidRequestError(capabilityError);
        validateDirectResponsesRequest(request);
        let candidates = directResponsesCandidates(c, request);
        let chatRequest: RequestData | undefined;
        if (candidates.some((candidate) => candidate.adapted)) {
            try {
                chatRequest = responsesToChatRequest(request);
            } catch (error) {
                // Chat cannot express this request: it fails on an adapted
                // primary and only skips adapted fallbacks.
                if (
                    !(error instanceof ResponsesInvalidRequestError) ||
                    candidates[0]?.adapted
                ) {
                    throw error;
                }
                candidates = candidates.filter(
                    (candidate) => !candidate.adapted,
                );
            }
        }
        const { result, candidate } = await withModelFallback(
            candidates,
            async (attempt): Promise<DirectResponsesResult> => {
                if (attempt.adapted && chatRequest) {
                    return callAdaptedChat(c, request, chatRequest, attempt);
                }
                // An upstream without SSE is asked for JSON, then its answer
                // is replayed as a stream.
                const buffered =
                    request.stream &&
                    attempt.definition?.supportsStreaming === false;
                const responsesClient = await responsesClientForAttempt(
                    c,
                    attempt,
                );
                const result = await callDirectResponses(
                    buffered ? { ...request, stream: false } : request,
                    responsesClient.target,
                    responsesClient.fetcher,
                );
                if (request.stream && !buffered) {
                    assertStreamContentType(
                        c,
                        result.response,
                        result.requestUrl,
                    );
                    return { ...result, usage: null };
                }

                let data: unknown;
                try {
                    data = await result.response.clone().json();
                } catch (cause) {
                    throw new UpstreamError(502, {
                        message: "Responses provider returned invalid JSON",
                        requestUrl: result.requestUrl,
                        cause,
                    });
                }
                const parsed = CreateResponseResponseSchema.safeParse(data);
                if (!parsed.success) {
                    throw new UpstreamError(502, {
                        message:
                            "Responses provider returned an invalid response or omitted usage",
                        requestUrl: result.requestUrl,
                    });
                }
                if (
                    parsed.data.status !== "completed" &&
                    parsed.data.status !== "incomplete" &&
                    parsed.data.status !== "failed"
                ) {
                    throw new UpstreamError(502, {
                        message:
                            "Responses provider returned a non-terminal response",
                        requestUrl: result.requestUrl,
                    });
                }
                if (buffered) {
                    // Billing reads usage from the replayed terminal event.
                    const response = new Response(
                        textResponseStream(parsed.data),
                        { headers: { "Content-Type": "text/event-stream" } },
                    );
                    return { ...result, response, usage: null };
                }
                return { ...result, usage: parsed.data.usage };
            },
            c.var.track?.attempts,
            (attempt) => enforceModelRateLimit(c, attempt),
        );
        c.set("upstreamRequestUrl", result.requestUrl);

        const headers = new Headers({
            "Content-Type": request.stream
                ? "text/event-stream; charset=utf-8"
                : "application/json; charset=utf-8",
            "Cache-Control": request.stream ? "no-cache" : "no-store",
            [MODEL_USED_HEADER]: candidate.id,
        });
        if (candidate.originalIndex > 0) {
            headers.set(
                FALLBACK_TARGET_HEADER,
                formatFallbackTarget(candidate.originalIndex),
            );
        }

        if (!request.stream && result.usage) {
            for (const [name, value] of Object.entries(
                buildUsageHeaders(
                    candidate.id,
                    responsesUsageToUsage(result.usage),
                ),
            )) {
                headers.set(name, value);
            }
            if (hasExplicitPromptCacheHit(result.usage)) {
                headers.set(PROMPT_CACHE_TYPE_HEADER, "ephemeral");
            }
        }

        let responseBody = result.response.body;
        let trackingResponse = result.trackingBody
            ? new Response(result.trackingBody, { headers })
            : undefined;
        if (request.stream && responseBody && !trackingResponse) {
            // Client and billing must see the same validation errors.
            const [clientBody, trackingBody] =
                requireResponsesStreamUsage(responseBody).tee();
            responseBody = clientBody;
            trackingResponse = new Response(trackingBody, { headers });
        }
        const response = new Response(responseBody, { headers });
        c.var.track?.overrideResponseTracking(
            trackingResponse ?? response.clone(),
        );
        return response;
    } catch (thrown) {
        if (thrown instanceof ResponsesInvalidRequestError) {
            return c.json(thrown.details, 400);
        }
        throwTextError(thrown as ServiceError);
    }
}

export async function generateCreateResponse(
    c: ResponsesContext,
): Promise<Response> {
    const requestBody = await applySafetyToResponseRequest(c, {
        ...(c.req.valid("json" as never) as CreateResponseRequest),
        model: c.var.model.resolved,
    });
    const response = await handleDirectResponse(c, requestBody);
    return withSafetyHeaders(c, response);
}
