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
 * Both agent kinds delegate and a proxy never does — the listing's type says
 * so, and no flag can make a proxy delegate. The other two conditions are
 * invariants, so they throw: the endpoint must be free, since charging a
 * wrapper price on top of the generation it bills the caller for is double
 * billing, and the request must carry a key to bill, since falling back to the
 * saved bearer would quietly move the cost of the agent's work onto the
 * endpoint owner.
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
        // Only an agent Enter runs names one. An agent on the owner's own
        // server gets a token that authorizes spending and nothing else.
        managedAgentId:
            endpoint.kind === "prompt_agent" ? endpoint.agentId : undefined,
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
    // Only a proxy stores a credential, and only a proxy is sent one. Either
    // agent kind is sent the run token instead, so neither can ever receive a
    // key it could spend on the owner's account. mintDelegatedToken always
    // returns a token for an agent, so a missing one means the caller had no
    // key to bill.
    const authKey =
        endpoint.kind === "proxy"
            ? normalizeCommunityEndpointBearerToken(
                  await decryptSecret(endpoint.bearerTokenCiphertext, secret),
              )
            : runToken;
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
