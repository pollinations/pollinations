import { signAgentRunToken } from "@shared/auth/agent-run-token.ts";
import {
    type CommunityEndpointRuntime,
    communityOpenAIBaseUrl,
    isFreeCommunityEndpoint,
    normalizeCommunityEndpointBearerToken,
} from "@shared/community-endpoints.ts";
import type { ModelDefinition } from "@shared/registry/registry.ts";
import { decryptSecret } from "@shared/secret-encryption.ts";
import type { RequestData, TransformOptions } from "./types.js";

/**
 * The spend credential a delegating endpoint receives, or undefined.
 *
 * Agent-style endpoints call back into the generation API on the caller's
 * behalf, so they need spend authority — but never the caller's own key. They
 * get a run token: short-lived, no account scope, billed to the caller's key.
 *
 * Three conditions must hold, and all three fail closed. The endpoint must be
 * admin-flagged; it must be free, since charging a wrapper price on top of the
 * generation it bills the caller for is double billing; and the request must be
 * authenticated, since there is no one to bill otherwise.
 */
async function mintDelegatedToken(
    endpoint: CommunityEndpointRuntime,
    parentApiKeyId: string | undefined,
    secret: string,
): Promise<string | undefined> {
    if (!endpoint.delegatesGeneration || !parentApiKeyId) return undefined;
    if (!isFreeCommunityEndpoint(endpoint)) {
        throw new Error(
            `Community endpoint '${endpoint.modelId}' delegates generation but is not free`,
        );
    }
    return signAgentRunToken({
        secret,
        parentApiKeyId,
        agentId: endpoint.modelId,
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
    const bearerToken = await decryptSecret(
        endpoint.bearerTokenCiphertext,
        secret,
    );
    const { messages: _messages, ...requestDataWithoutMessages } = requestData;
    const runToken = await mintDelegatedToken(endpoint, parentApiKeyId, secret);

    return {
        ...requestDataWithoutMessages,
        modelConfig: {
            provider: "openai",
            "custom-host": communityOpenAIBaseUrl(endpoint.baseUrl),
            // Authorization proves we may call this endpoint at all; the run
            // token is what it may spend. Two credentials, two headers — so an
            // endpoint can never spend its own access credential.
            authKey: normalizeCommunityEndpointBearerToken(bearerToken),
            model: endpoint.upstreamModel,
            ...(runToken ? { agentRunToken: runToken } : {}),
        },
        modelDef: modelDefinition,
        requestedModel: endpoint.modelId,
        portkeyGatewayUrl,
        userApiKey,
    };
}
