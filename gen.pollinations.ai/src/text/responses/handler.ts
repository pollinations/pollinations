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
import { enforceModelRateLimit } from "../../utils/model-rate-limit.ts";
import { assertStreamContentType } from "../../utils/upstream-response.ts";
import { createPromptAgentResponsesClient } from "../agents/client.ts";
import { createCodeAgentResponsesClient } from "../agents/code-client.ts";
import { communityEndpointModelConfig } from "../communityEndpoint.js";
import { syncTextEnvironment } from "../environment.js";
import { throwTextError } from "../errors.js";
import {
    supportsTextFallbackRequest,
    textCapabilityError,
} from "../fallbackCompatibility.js";
import { handleChatCompletionLocal } from "../handler.js";
import type { ChatCompletion, ServiceError } from "../types.js";
import {
    chatToResponsesResponse,
    chatToResponsesStream,
} from "./chatToResponse.js";
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
import { responsesToChatRequest } from "./responsesToChat.js";
import { applySafetyToResponseRequest } from "./safety.js";
import { requireResponsesStreamUsage } from "./stream.js";

type ResponsesContext = Context<Env>;

type DirectResponsesCandidate = FallbackCandidate & {
    responsesTarget?: DirectResponsesTarget;
    /**
     * Chat-only model (or chat_completions community endpoint): no native
     * Responses upstream, serve through the Chat pipeline with the
     * responsesToChat/chatToResponse adapter pair (#16674).
     */
    adapted?: boolean;
    originalIndex: number;
};

type DirectResponsesResult = Awaited<ReturnType<typeof callDirectResponses>> & {
    usage: ResponseUsage | null;
};

function directResponsesCandidates(
    c: ResponsesContext,
    request: CreateResponseRequest,
): DirectResponsesCandidate[] {
    const candidates = fallbackCandidates(c.var.model);
    const primary = candidates[0];
    if (!primary) {
        throw new ResponsesInvalidRequestError(
            `Model ${request.model} does not support the stateless Responses API`,
        );
    }
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
    const primaryTarget = targetFor(primary);
    // A null target means chat-only: serve through the adapted Chat pipeline
    // instead of rejecting (#16674). Undefined keeps the community Responses
    // client path below.
    const supported: DirectResponsesCandidate[] = [
        {
            ...primary,
            ...(primaryTarget ? { responsesTarget: primaryTarget } : {}),
            ...(primaryTarget === null ? { adapted: true } : {}),
            originalIndex: 0,
        },
    ];
    for (let index = 1; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        if (!supportsTextFallbackRequest(candidate.definition, request)) {
            continue;
        }
        const target = targetFor(candidate);
        if (target === null) {
            supported.push({
                ...candidate,
                adapted: true,
                originalIndex: index,
            });
            continue;
        }
        supported.push({
            ...candidate,
            ...(target ? { responsesTarget: target } : {}),
            originalIndex: index,
        });
    }
    if (!supported.length) {
        throw new ResponsesInvalidRequestError(
            `Model ${request.model} does not support the stateless Responses API`,
        );
    }
    return supported;
}

/**
 * Serve a Responses request through the Chat pipeline (adapted path, #16674).
 * Converts the request uphill, runs the Chat flow for exactly `attempt`
 * (single-level fallback: the outer loop retries other candidates), then
 * converts the result downhill. The returned shape matches the direct path so
 * billing headers and stream tracking below are shared.
 */
async function callAdaptedResponses(
    c: ResponsesContext,
    request: CreateResponseRequest,
    attempt: DirectResponsesCandidate,
): Promise<DirectResponsesResult> {
    // Scope the inner Chat run to this attempt: without the swap the inner
    // fallback would re-run the primary and the outer header would misclaim
    // the served model. No fallbackEntries: the outer loop owns
    // retries across native and adapted candidates.
    const savedModel = c.var.model;
    c.set("model", {
        requested: savedModel.requested,
        resolved: attempt.id,
        definition: attempt.definition,
        communityEndpoint: attempt.communityEndpoint,
    } as never);
    // The inner flow tees and overrides tracking for its own Chat response;
    // mute it for the duration so only the outer Responses tracking wins and
    // the attempts log keeps one settled entry per outer attempt. Cancel the
    // discarded tracking body so the tee's unconsumed branch does not buffer
    // the whole stream in memory.
    const track = c.var.track;
    const savedOverride = track?.overrideResponseTracking;
    const savedAttemptsLength = track?.attempts?.length ?? 0;
    if (track) {
        track.overrideResponseTracking = (response: Response) => {
            void response.body?.cancel().catch(() => {});
        };
    }
    let chatResponse: Response;
    try {
        const { messages, options } = responsesToChatRequest(request);
        const { model: _model, ...chatOptions } = options;
        chatResponse = await handleChatCompletionLocal(c, {
            model: attempt.id,
            messages,
            stream: request.stream ?? false,
            ...chatOptions,
        } as never);
    } finally {
        c.set("model", savedModel);
        if (track) {
            if (savedOverride) {
                track.overrideResponseTracking = savedOverride;
            } else {
                // The property was absent before the mute; remove the
                // placeholder instead of leaving it behind (telemetry leak).
                delete (track as Partial<typeof track>)
                    .overrideResponseTracking;
            }
            if (track.attempts) {
                track.attempts.length = savedAttemptsLength;
            }
        }
    }
    // The inner Chat flow records its own upstream URL for tracking.
    const upstream = c.get("upstreamRequestUrl");
    const requestUrl =
        upstream instanceof URL
            ? upstream
            : new URL(typeof upstream === "string" ? upstream : c.req.url);
    if (!request.stream) {
        let chatJson: ChatCompletion;
        try {
            chatJson = (await chatResponse.json()) as ChatCompletion;
        } catch (cause) {
            // Same classification as the native path: a broken upstream body
            // is an upstream 502, not our own 500.
            throw new UpstreamError(502, {
                message: "Chat provider returned invalid JSON",
                requestUrl,
                cause,
            });
        }
        const converted = chatToResponsesResponse(
            chatJson,
            attempt.id,
            request,
        );
        return {
            response: new Response(JSON.stringify(converted), {
                headers: {
                    "Content-Type": "application/json; charset=utf-8",
                },
            }),
            requestUrl,
            usage: converted.usage,
        };
    }
    // A non-SSE or error body here means the inner pipeline surfaced a failure
    // response instead of a stream; surface it as an upstream error (keeping
    // the original status for fallback) so the outer loop can retry.
    if (
        !chatResponse.ok ||
        !(chatResponse.headers.get("content-type") || "").includes(
            "text/event-stream",
        )
    ) {
        throw new UpstreamError(502, {
            message:
                "Chat pipeline did not return a stream for a streaming request",
            requestUrl,
            upstreamStatus: chatResponse.status,
        });
    }
    if (!chatResponse.body) {
        throw new UpstreamError(502, {
            message: "Chat provider returned an empty stream",
            requestUrl,
        });
    }
    return {
        response: new Response(
            chatToResponsesStream(chatResponse.body, attempt.id, request),
            {
                headers: {
                    "Content-Type": "text/event-stream; charset=utf-8",
                },
            },
        ),
        requestUrl,
        usage: null,
    };
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
        const { result, candidate } = await withModelFallback(
            directResponsesCandidates(c, request),
            async (attempt): Promise<DirectResponsesResult> => {
                // Chat-only candidates run the adapted Chat pipeline, so
                // fallback works between native and adapted models in both
                // directions (#16674).
                if (attempt.adapted) {
                    return callAdaptedResponses(c, request, attempt);
                }
                const responsesClient = await responsesClientForAttempt(
                    c,
                    attempt,
                );
                const result = await callDirectResponses(
                    request,
                    responsesClient.target,
                    responsesClient.fetcher,
                );
                if (request.stream) {
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
                return { ...result, usage: parsed.data.usage };
            },
            c.var.track?.attempts,
            // Adapted attempts are rate-limited once by the inner Chat flow;
            // enforcing here too would spend 2 tokens per attempt.
            async (attempt) => {
                if (!attempt.adapted) await enforceModelRateLimit(c, attempt);
            },
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
        let trackingResponse: Response | undefined;
        if (request.stream && responseBody) {
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
