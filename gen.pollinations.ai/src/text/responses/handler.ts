import { UpstreamError } from "@shared/error.ts";
import {
    buildUsageHeaders,
    FALLBACK_TARGET_HEADER,
    MODEL_USED_HEADER,
} from "@shared/registry/usage-headers.ts";
import type { CreateResponseRequest } from "@shared/schemas/openai.ts";
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
import { syncTextEnvironment } from "../environment.js";
import { throwTextError } from "../errors.js";
import type { ServiceError } from "../types.js";
import {
    callDirectResponses,
    type DirectResponsesTarget,
    resolveDirectResponsesTarget,
} from "./client.js";
import {
    responsesInvalidRequest,
    validateDirectResponsesRequest,
} from "./request.js";
import { applySafetyToResponseRequest } from "./safety.js";
import { getResponsesUsage } from "./tracking.js";

type ResponsesContext = Context<Env>;

type DirectResponsesCandidate = FallbackCandidate & {
    responsesTarget: DirectResponsesTarget;
    originalIndex: number;
};

function directResponsesCandidates(
    c: ResponsesContext,
    request: CreateResponseRequest,
): DirectResponsesCandidate[] {
    const candidates = fallbackCandidates(c.var.model);
    const primary = candidates[0];
    if (!primary || primary.communityEndpoint || primary.entry?.agentConfig) {
        throw responsesInvalidRequest(
            `Model ${request.model} does not support the direct Responses API`,
        );
    }
    const primaryTarget = resolveDirectResponsesTarget(
        primary.id,
        request,
        c.env,
    );
    if (!primaryTarget) {
        throw responsesInvalidRequest(
            `Model ${request.model} does not support the direct Responses API`,
        );
    }

    const supported: DirectResponsesCandidate[] = [
        { ...primary, responsesTarget: primaryTarget, originalIndex: 0 },
    ];
    for (let index = 1; index < candidates.length; index += 1) {
        const candidate = candidates[index];
        if (candidate.communityEndpoint || candidate.entry?.agentConfig) {
            continue;
        }
        const target = resolveDirectResponsesTarget(
            candidate.id,
            request,
            c.env,
        );
        if (!target) continue;
        supported.push({
            ...candidate,
            responsesTarget: target,
            originalIndex: index,
        });
    }
    return supported;
}

async function handleDirectResponse(
    c: ResponsesContext,
    request: CreateResponseRequest,
): Promise<Response> {
    syncTextEnvironment(c.env);
    validateDirectResponsesRequest(request);

    try {
        const { result, candidate } = await withModelFallback(
            directResponsesCandidates(c, request),
            (attempt) => callDirectResponses(request, attempt.responsesTarget),
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

        if (!request.stream) {
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
            if (
                !data ||
                typeof data !== "object" ||
                (data as { object?: unknown }).object !== "response"
            ) {
                throw new UpstreamError(502, {
                    message: "Responses provider returned an invalid response",
                    requestUrl: result.requestUrl,
                    responseBody: JSON.stringify(data),
                });
            }
            for (const [name, value] of Object.entries(
                buildUsageHeaders(
                    candidate.id,
                    getResponsesUsage(data) ?? undefined,
                ),
            )) {
                headers.set(name, value);
            }
        }

        const response = new Response(result.response.body, { headers });
        if (!request.stream) {
            c.var.track?.overrideResponseTracking(response.clone());
        }
        return response;
    } catch (thrown) {
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
    assertStreamContentType(c, response, c.var.upstreamRequestUrl);
    return withSafetyHeaders(c, response);
}
