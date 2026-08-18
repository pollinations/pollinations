import { signAgentRunToken } from "@shared/auth/agent-run-token.ts";
import {
    type CommunityEndpointRuntime,
    communityOpenAIBaseUrl,
    isDelegatingEndpoint,
    isFreeCommunityEndpoint,
    normalizeCommunityEndpointBearerToken,
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
 * Only agent listings delegate. The other two conditions are invariants, so
 * they throw: the endpoint must be free, since charging a wrapper price on top
 * of the generation it bills the caller for is double billing, and the request
 * must carry a key to bill, since falling back to the saved bearer would
 * quietly move the cost of the agent's work onto the endpoint owner.
 */
async function mintDelegatedToken(
    endpoint: CommunityEndpointRuntime,
    parentApiKeyId: string | undefined,
    secret: string,
): Promise<string | undefined> {
    if (!isDelegatingEndpoint(endpoint)) return undefined;
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
        // Only a prompt agent is run by Enter, so only it names one. An agent
        // on the owner's own server gets a token that authorizes spending and
        // nothing else.
        managedAgentId:
            endpoint.kind === "agent"
                ? (endpoint.agentId ?? undefined)
                : undefined,
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
    // An agent is sent the run token instead of a saved bearer, so it never
    // receives a credential it could spend on the owner's account — and stores
    // none. mintDelegatedToken always returns a token for one, so a missing
    // token means the caller had no key to bill.
    const authKey =
        endpoint.kind === "agent"
            ? runToken
            : normalizeCommunityEndpointBearerToken(
                  await decryptSecret(endpoint.bearerTokenCiphertext, secret),
              );
    if (!authKey) throw new Error("Agent request has no agent run token");

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
