import { communityDecisionsUrl } from "@shared/community-endpoint-urls.ts";
import {
    COMMUNITY_ENDPOINT_TIMEOUT_MS,
    type CommunityEndpointRuntime,
    normalizeCommunityEndpointBearerToken,
} from "@shared/community-endpoints.ts";
import { ensureUpstreamOk } from "@shared/error.ts";
import {
    buildUsageHeaders,
    openaiUsageToUsage,
} from "@shared/registry/usage-headers.ts";
import type {
    CreateDecisionRequest,
    CreateDecisionResponse,
} from "@shared/schemas/decisions.ts";
import { decryptSecret } from "@shared/secret-encryption.ts";
import type { Context } from "hono";
import type { Env } from "@/env.ts";
import { withModelFallbackResponse } from "../../fallback.ts";
import { requireModelAttemptAccess } from "../../utils/generation-access.ts";
import { syncTextEnvironment } from "../environment.js";
import { throwTextError } from "../errors.js";
import {
    decisionCompletionUsage,
    requestDecision,
} from "../systemOneClient.js";
import { resolveModelConfig } from "../utils/modelResolver.js";

/**
 * Forward a decisions request to a community decision endpoint.
 *
 * Community decision endpoints must implement the OpenRouter decisions wire
 * format: POST { state, questions, model } → { model, answers, usage }.
 * The gateway validates the response, normalises the model field to the
 * Pollinations-canonical ID, and bills through the same usage headers as the
 * first-party decision models.
 */
async function requestCommunityDecision(
    request: { state: unknown; questions: Record<string, unknown> },
    endpoint: CommunityEndpointRuntime,
    secret: string,
): Promise<{
    result: {
        model: string;
        answers: Record<string, unknown>;
        usage: { input_tokens: number; output_tokens: number };
    };
    requestUrl: URL;
}> {
    if (endpoint.type !== "proxy") {
        throw Object.assign(
            new Error(
                `Community decision endpoint '${endpoint.modelId}' is a managed agent`,
            ),
            { status: 500 },
        );
    }
    const bearerToken = normalizeCommunityEndpointBearerToken(
        await decryptSecret(endpoint.bearerTokenCiphertext, secret),
    );
    const requestUrl = new URL(communityDecisionsUrl(endpoint.baseUrl));
    const response = await fetch(requestUrl, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${bearerToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: endpoint.upstreamModel,
            ...request,
        }),
        signal: AbortSignal.timeout(COMMUNITY_ENDPOINT_TIMEOUT_MS),
    });
    await ensureUpstreamOk(response, requestUrl);
    const body = await response.json();
    // Minimal validation: answers and billable usage must be present.
    if (
        !body ||
        typeof body !== "object" ||
        typeof (body as Record<string, unknown>).answers !== "object" ||
        !(body as Record<string, unknown>).answers ||
        typeof (body as Record<string, unknown>).usage !== "object"
    ) {
        throw Object.assign(
            new Error(
                `Community decision endpoint '${endpoint.modelId}' returned an invalid response`,
            ),
            { status: 502, requestUrl },
        );
    }
    const result = body as {
        model: string;
        answers: Record<string, unknown>;
        usage: { input_tokens: number; output_tokens: number };
    };
    return { result, requestUrl };
}

/**
 * Native decisions route. The body is already the provider's own shape, so
 * nothing is transformed on the way out; on the way back the provider's
 * response is re-keyed to our model identity and billed through usage headers
 * like the other non-OpenAI response bodies (transcriptions, TTS).
 */
export async function generateDecision(c: Context<Env>): Promise<Response> {
    const { state, questions } = c.req.valid(
        "json" as never,
    ) as CreateDecisionRequest;

    syncTextEnvironment(c.env);
    return withModelFallbackResponse(
        c.var.model,
        async (candidate) => {
            const communityEndpoint = candidate.communityEndpoint as
                | CommunityEndpointRuntime
                | undefined;

            let result: {
                answers: Record<string, unknown>;
                usage: { input_tokens: number; output_tokens: number };
            };
            let requestUrl: URL;

            if (communityEndpoint) {
                // Community decision endpoint: forward with its stored bearer.
                const secret = c.env.BETTER_AUTH_SECRET;
                ({ result, requestUrl } = await requestCommunityDecision(
                    { state, questions },
                    communityEndpoint,
                    secret,
                ));
            } else {
                // First-party decision model (Jev, Span, etc.).
                const { options } = resolveModelConfig([], {
                    model: candidate.id,
                });
                ({ result, requestUrl } = await requestDecision(
                    { state, questions },
                    options,
                ));
            }

            c.set("upstreamRequestUrl", requestUrl);
            const selectedModel = c.var.model.requested.includes(",")
                ? candidate.entry
                : undefined;

            const body: CreateDecisionResponse = {
                id: `dec-${crypto.randomUUID()}`,
                // The registry owns public model identity: the provider answers with
                // its own dated build id, which is not a name callers can request.
                model: selectedModel?.id ?? c.var.model.resolved,
                provider:
                    (selectedModel?.definition ?? c.var.model.definition)
                        .publisher ?? "",
                answers: result.answers as CreateDecisionResponse["answers"],
                usage: {
                    input_tokens: result.usage.input_tokens,
                    output_tokens: result.usage.output_tokens,
                },
            };

            return Response.json(body, {
                headers: buildUsageHeaders(
                    candidate.id,
                    openaiUsageToUsage(decisionCompletionUsage(result.usage)),
                ),
            });
        },
        c.var.track?.attempts,
        (candidate) => requireModelAttemptAccess(c, candidate),
    ).catch(throwTextError);
}
