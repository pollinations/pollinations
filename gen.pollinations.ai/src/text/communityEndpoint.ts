import { signAgentRunToken } from "@shared/auth/agent-run-token.ts";
import {
    type CommunityEndpointRuntime,
    isFreeCommunityEndpoint,
    normalizeCommunityEndpointBearerToken,
    usesAgentRunToken,
} from "@shared/community-endpoints.ts";
import type { ModelDefinition } from "@shared/registry/registry.ts";
import { decryptSecret } from "@shared/secret-encryption.ts";
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
 * Both agent kinds delegate and a proxy never does — the listing's type says
 * so, and no flag can make a proxy delegate. The other two conditions are
 * invariants, so they throw: the endpoint must be free, since charging a
 * wrapper price on top of the generation it bills the caller for is double
 * billing, and the request must carry a key to bill, since falling back to the
 * saved bearer would quietly move the cost of the agent's work onto the
 * endpoint owner.
 */
async function mintDelegatedToken({
    endpoint,
    parentApiKeyId,
    parentRequestId,
    secret,
}: {
    endpoint: CommunityEndpointRuntime;
    parentApiKeyId: string | undefined;
    parentRequestId: string;
    secret: string;
}): Promise<string | undefined> {
    if (!usesAgentRunToken(endpoint)) return undefined;
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
        parentRequestId,
        // The managed runtime uses the listing id (also its upstream model) to
        // select the prompt config. An external agent only needs spend scope.
        managedAgentId:
            endpoint.type === "prompt_agent" ? endpoint.id : undefined,
    });
}

export async function communityEndpointGatewayContext({
    endpoint,
    modelDefinition,
    requestData,
    secret,
    portkeyGatewayUrl,
    userApiKey,
    parentRequestId,
    parentApiKeyId,
}: {
    endpoint: CommunityEndpointRuntime;
    modelDefinition: ModelDefinition;
    requestData: RequestData;
    secret: string;
    portkeyGatewayUrl: string;
    userApiKey: string;
    parentRequestId: string;
    parentApiKeyId?: string;
}): Promise<TransformOptions> {
    const { messages: _messages, ...requestDataWithoutMessages } = requestData;
    const modelConfig = await communityEndpointModelConfig({
        endpoint,
        secret,
        parentRequestId,
        parentApiKeyId,
    });
    return {
        ...requestDataWithoutMessages,
        modelConfig,
        modelDef: modelDefinition,
        requestedModel: endpoint.modelId,
        portkeyGatewayUrl,
        userApiKey,
    };
}

export async function communityEndpointModelConfig({
    endpoint,
    secret,
    parentRequestId,
    parentApiKeyId,
}: {
    endpoint: CommunityEndpointRuntime;
    secret: string;
    parentRequestId: string;
    parentApiKeyId?: string;
}): Promise<Record<string, unknown>> {
    const runToken = await mintDelegatedToken({
        endpoint,
        parentApiKeyId,
        parentRequestId,
        secret,
    });
    // Only a proxy stores and receives its registered upstream bearer secret.
    // Neither agent kind receives a Pollinations API key: each gets a
    // short-lived run token instead. mintDelegatedToken always returns one for
    // an agent, so a missing token means the caller had no key to bill.
    const authKey =
        endpoint.type === "proxy"
            ? normalizeCommunityEndpointBearerToken(
                  await decryptSecret(endpoint.bearerTokenCiphertext, secret),
              )
            : runToken;
    if (!authKey) throw new Error("Agent request has no agent run token");

    return {
        provider: "openai",
        authKey,
        model: endpoint.upstreamModel,
        ...(endpoint.api === "responses"
            ? { responsesEndpoint: endpoint.baseUrl }
            : { directEndpoint: endpoint.baseUrl }),
    };
}
