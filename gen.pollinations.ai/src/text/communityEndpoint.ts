import { signAgentRunToken } from "@shared/auth/agent-run-token.ts";
import {
    type CommunityEndpointRuntime,
    communityGroupModelId,
    communityOpenAIBaseUrl,
    isFreeCommunityEndpoint,
    normalizeCommunityEndpointBearerToken,
    rotateCommunityGroupMembers,
} from "@shared/community-endpoints.ts";
import type { ModelDefinition } from "@shared/registry/registry.ts";
import { decryptSecret } from "@shared/secret-encryption.ts";
import { FALLBACK_ON_STATUS_CODES } from "../fallback.ts";
import type { RequestData, TransformOptions } from "./types.js";

/**
 * The run token a delegating endpoint authenticates with, or undefined.
 *
 * Agent-style endpoints call back into the generation API on the caller's
 * behalf, so they need spend authority — but never the caller's own key. They
 * get a run token: short-lived, no account scope, billed to the caller's key.
 *
 * It replaces the endpoint's saved bearer rather than riding alongside it, so a
 * delegating endpoint stays a plain OpenAI-compatible server with no
 * Pollinations-specific header to implement, and never holds a credential it
 * could spend as its own. It is not a weaker proof of origin than the static
 * secret it replaces: the endpoint can verify it against `/account/key`, which
 * a shared string cannot do.
 *
 * The admin flag alone decides whether to delegate. Once it is set the other
 * two conditions are invariants, so they throw rather than degrade: the
 * endpoint must be free, since charging a wrapper price on top of the
 * generation it bills the caller for is double billing, and the request must
 * carry a key to bill, since falling back to the saved bearer would quietly
 * move the cost of the agent's work onto the endpoint owner.
 */
async function mintDelegatedToken(
    endpoint: CommunityEndpointRuntime,
    parentApiKeyId: string | undefined,
    secret: string,
): Promise<string | undefined> {
    if (!endpoint.delegatesGeneration) return undefined;
    if (!isFreeCommunityEndpoint(endpoint)) {
        throw new Error(
            `Community endpoint '${endpoint.modelId}' delegates generation but is not free`,
        );
    }
    if (!parentApiKeyId) {
        throw new Error(
            `Community endpoint '${endpoint.modelId}' delegates generation but the request has no API key to bill`,
        );
    }
    return signAgentRunToken({
        secret,
        parentApiKeyId,
        runId: crypto.randomUUID(),
    });
}

export async function communityEndpointGatewayContext(
    endpoint: CommunityEndpointRuntime,
    modelDefinition: ModelDefinition,
    requestData: RequestData,
    secret: string,
    portkeyGatewayUrl: string,
    userApiKey: string,
    parentApiKeyId?: string,
): Promise<TransformOptions> {
    const { messages: _messages, ...requestDataWithoutMessages } = requestData;
    const runToken = await mintDelegatedToken(endpoint, parentApiKeyId, secret);
    // A delegating endpoint is sent the run token instead of its saved bearer,
    // so it never receives a credential it could spend on the owner's account.
    const authKey =
        runToken ??
        normalizeCommunityEndpointBearerToken(
            await decryptSecret(endpoint.bearerTokenCiphertext, secret),
        );

    return {
        ...requestDataWithoutMessages,
        modelConfig: {
            provider: "openai",
            "custom-host": communityOpenAIBaseUrl(endpoint.baseUrl),
            authKey,
            model: endpoint.upstreamModel,
        },
        modelDef: modelDefinition,
        requestedModel: endpoint.modelId,
        portkeyGatewayUrl,
        userApiKey,
    };
}

/**
 * Portkey fallback config across the members of a pooled model. `targets` is
 * returned so the caller can map Portkey's served-target index back to the
 * member that did the work.
 */
export async function communityGroupGatewayContext(
    members: readonly CommunityEndpointRuntime[],
    modelDefinition: ModelDefinition,
    requestData: RequestData,
    secret: string,
    portkeyGatewayUrl: string,
    userApiKey: string,
    startIndex: number,
): Promise<{ options: TransformOptions; targets: CommunityEndpointRuntime[] }> {
    const targets = rotateCommunityGroupMembers(members, startIndex);
    const tokens = await Promise.all(
        targets.map((member) =>
            decryptSecret(member.bearerTokenCiphertext, secret),
        ),
    );
    const { messages: _messages, ...requestDataWithoutMessages } = requestData;

    return {
        options: {
            ...requestDataWithoutMessages,
            modelConfig: {
                // resolveModelConfig() derives the request-body model from
                // config.model (utils/modelResolver.ts). A strategy/targets
                // config has no provider-level model, so this must be set
                // explicitly or the body ships model: undefined. Each target
                // overrides it with its own upstream name anyway.
                model: targets[0].upstreamModel,
                strategy: {
                    mode: "fallback",
                    on_status_codes: FALLBACK_ON_STATUS_CODES,
                },
                targets: targets.map((member, index) => ({
                    provider: "openai",
                    custom_host: communityOpenAIBaseUrl(member.baseUrl),
                    authKey: normalizeCommunityEndpointBearerToken(
                        tokens[index],
                    ),
                    override_params: { model: member.upstreamModel },
                })),
            },
            modelDef: modelDefinition,
            requestedModel: communityGroupModelId(targets[0].name),
            portkeyGatewayUrl,
            userApiKey,
        },
        targets,
    };
}
