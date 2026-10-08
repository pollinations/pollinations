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
    type CreateChatCompletionRequest,
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
import { publicChatStream } from "../chat/public.js";
import { requireChatStreamUsage } from "../chat/usage.js";
import { communityEndpointModelConfig } from "../communityEndpoint.js";
import { syncTextEnvironment } from "../environment.js";
import { throwTextError } from "../errors.js";
import {
    supportsTextFallbackRequest,
    textCapabilityError,
} from "../fallbackCompatibility.js";
import { runChatCompletionAttempt } from "../handler.js";
import { getChatRequestData } from "../requestUtils.js";
import type { ChatCompletion, ServiceError } from "../types.js";
import {
    chatCompletionToResponse,
    responsesToChatRequest,
} from "./chatAdaptedRequest.js";
import { chatStreamToResponsesStream } from "./chatAdaptedStream.js";
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

/**
 * One fallback candidate for /v1/responses. Native candidates speak the
 * Responses API upstream (static target resolved up front, or a community
 * endpoint resolved per attempt). Adapted candidates only speak Chat
 * Completions upstream and carry the translated chat request; the adapted
 * executor runs the exact chat attempt body and converts in/out.
 */
type ResponsesCandidate = FallbackCandidate & {
    responsesTarget?: DirectResponsesTarget;
    chatRequest?: CreateChatCompletionRequest;
    originalIndex: number;
};

type NativeResponsesResult = Awaited<ReturnType<typeof callDirectResponses>> & {
    usage: ResponseUsage | null;
};

type ResponsesAttemptResult =
    | { kind: "native"; native: NativeResponsesResult }
    | { kind: "adapted"; completion: ChatCompletion };

function responsesCandidates(
    c: ResponsesContext,
    request: CreateResponseRequest,
): ResponsesCandidate[] {
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

    // The chat translation only depends on the request, so it is shared by
    // every adapted candidate; the model id is stamped per candidate. When the
    // primary itself is adapted an untranslatable request is a 400 - for
    // adapted fallbacks it just disqualifies the candidate.
    let sharedChatRequest: CreateChatCompletionRequest | null | undefined;
    const adaptedFor = (
        candidate: FallbackCandidate,
    ): CreateChatCompletionRequest | null => {
        if (sharedChatRequest === undefined) {
            try {
                sharedChatRequest = responsesToChatRequest(
                    request,
                    candidate.id,
                );
            } catch {
                sharedChatRequest = null;
            }
        }
        if (!sharedChatRequest) return null;
        if (
            !supportsTextFallbackRequest(
                candidate.definition,
                sharedChatRequest,
            )
        )
            return null;
        return { ...sharedChatRequest, model: candidate.id };
    };

    const primaryTarget = targetFor(primary);
    const supported: ResponsesCandidate[] = [];
    if (primaryTarget !== null) {
        supported.push({
            ...primary,
            ...(primaryTarget ? { responsesTarget: primaryTarget } : {}),
            originalIndex: 0,
        });
    } else {
        // Adapted primary: translation errors belong to the request, surface
        // them as a 400 instead of the old "not supported" blanket message.
        const chatRequest = responsesToChatRequest(request, primary.id);
        const capabilityError = textCapabilityError(
            primary.definition,
            chatRequest as Record<string, unknown>,
            primary.communityEndpoint,
        );
        if (capabilityError)
            throw new ResponsesInvalidRequestError(capabilityError);
        supported.push({ ...primary, chatRequest, originalIndex: 0 });
    }
    for (let index = 1; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        const target = targetFor(candidate);
        if (target !== null) {
            if (!supportsTextFallbackRequest(candidate.definition, request)) {
                continue;
            }
            supported.push({
                ...candidate,
                ...(target ? { responsesTarget: target } : {}),
                originalIndex: index,
            });
            continue;
        }
        const chatRequest = adaptedFor(candidate);
        if (!chatRequest) continue;
        supported.push({ ...candidate, chatRequest, originalIndex: index });
    }
    return supported;
}

async function responsesClientForAttempt(
    c: ResponsesContext,
    attempt: ResponsesCandidate,
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

function baseHeaders(
    request: CreateResponseRequest,
    candidate: ResponsesCandidate,
): Headers {
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
    return headers;
}

/**
 * Adapted path: the chat pipeline produced (and usage-validated) a Chat
 * Completions result; convert it to the public Responses shape. Tracking is
 * installed exactly once here - the chat handler's own tracking never runs.
 */
function adaptedResponse(
    c: ResponsesContext,
    request: CreateResponseRequest,
    candidate: ResponsesCandidate,
    completion: ChatCompletion,
): Response {
    c.set("upstreamRequestUrl", completion.upstreamRequestUrl);
    const headers = baseHeaders(request, candidate);

    if (!request.stream) {
        const responseBody = chatCompletionToResponse(completion, candidate.id);
        const usage = responseBody.usage;
        if (!usage) {
            throw new UpstreamError(502, {
                message:
                    "Chat Completions provider returned an invalid response or omitted usage",
                requestUrl: completion.upstreamRequestUrl,
            });
        }
        for (const [name, value] of Object.entries(
            buildUsageHeaders(candidate.id, responsesUsageToUsage(usage)),
        )) {
            headers.set(name, value);
        }
        if (hasExplicitPromptCacheHit(completion.usage)) {
            headers.set(PROMPT_CACHE_TYPE_HEADER, "ephemeral");
        }
        const response = new Response(JSON.stringify(responseBody), {
            headers,
        });
        c.var.track?.overrideResponseTracking(response.clone());
        return response;
    }

    if (!completion.responseStream) {
        throw new UpstreamError(502, {
            message: "Chat Completions provider returned no stream",
            requestUrl: completion.upstreamRequestUrl,
        });
    }
    // Client and billing must see the same validation errors.
    const [clientBody, trackingBody] = requireChatStreamUsage(
        completion.responseStream as ReadableStream<Uint8Array<ArrayBuffer>>,
    ).tee();
    const isVercel = candidate.definition?.provider === "vercel";
    const publicBody = isVercel ? publicChatStream(clientBody) : clientBody;
    const response = new Response(
        chatStreamToResponsesStream(publicBody, candidate.id),
        { headers },
    );
    c.var.track?.overrideResponseTracking(
        new Response(trackingBody, { headers }),
    );
    return response;
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
            responsesCandidates(c, request),
            async (attempt): Promise<ResponsesAttemptResult> => {
                if (attempt.chatRequest) {
                    const requestData = getChatRequestData(attempt.chatRequest);
                    const completion = await runChatCompletionAttempt(
                        c,
                        requestData,
                        attempt,
                    );
                    completion.id =
                        completion.id ||
                        `chatcmpl-${crypto.randomUUID().replaceAll("-", "")}`;
                    return { kind: "adapted", completion };
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
                    return {
                        kind: "native",
                        native: { ...result, usage: null },
                    };
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
                return {
                    kind: "native",
                    native: { ...result, usage: parsed.data.usage },
                };
            },
            c.var.track?.attempts,
            (attempt) => enforceModelRateLimit(c, attempt),
        );

        if (result.kind === "adapted") {
            return adaptedResponse(c, request, candidate, result.completion);
        }

        const native = result.native;
        c.set("upstreamRequestUrl", native.requestUrl);

        const headers = baseHeaders(request, candidate);

        if (!request.stream && native.usage) {
            for (const [name, value] of Object.entries(
                buildUsageHeaders(
                    candidate.id,
                    responsesUsageToUsage(native.usage),
                ),
            )) {
                headers.set(name, value);
            }
            if (hasExplicitPromptCacheHit(native.usage)) {
                headers.set(PROMPT_CACHE_TYPE_HEADER, "ephemeral");
            }
        }

        let responseBody = native.response.body;
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
