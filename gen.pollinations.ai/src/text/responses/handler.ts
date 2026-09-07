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
import { communityEndpointModelConfig } from "../communityEndpoint.js";
import { syncTextEnvironment } from "../environment.js";
import { throwTextError } from "../errors.js";
import { supportsTextFallbackRequest } from "../fallbackCompatibility.js";
import type { ServiceError } from "../types.js";
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
    if (primaryTarget === null) {
        throw new ResponsesInvalidRequestError(
            `Model ${request.model} does not support the stateless Responses API`,
        );
    }

    const supported: DirectResponsesCandidate[] = [
        {
            ...primary,
            ...(primaryTarget ? { responsesTarget: primaryTarget } : {}),
            originalIndex: 0,
        },
    ];
    for (let index = 1; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        if (!supportsTextFallbackRequest(candidate.definition, request)) {
            continue;
        }
        const target = targetFor(candidate);
        if (target === null) continue;
        supported.push({
            ...candidate,
            ...(target ? { responsesTarget: target } : {}),
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
    if (endpoint.type === "prompt_agent") {
        const apiKey = config.authKey;
        if (typeof apiKey !== "string" || !apiKey) {
            throw new Error("Managed agent request has no agent run token");
        }
        return createPromptAgentResponsesClient(c, endpoint, apiKey);
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
        validateDirectResponsesRequest(request);
        const { result, candidate } = await withModelFallback(
            directResponsesCandidates(c, request),
            async (attempt): Promise<DirectResponsesResult> => {
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
