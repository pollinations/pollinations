import type { AuthenticatedApiKey, AuthUser } from "@shared/auth/api-key.ts";
import { mintRunToken } from "@shared/auth/run-token.ts";
import {
    type CommunityEndpointRuntime,
    communityOpenAIBaseUrl,
    normalizeCommunityEndpointBearerToken,
} from "@shared/community-endpoints.ts";
import type { ModelDefinition } from "@shared/registry/registry.ts";
import { decryptSecret } from "@shared/secret-encryption.ts";
import type { RequestData, TransformOptions } from "./types.js";

type RequestAuth = {
    user?: AuthUser;
    apiKey?: AuthenticatedApiKey;
};

/**
 * The credential a community endpoint may spend on the caller's behalf.
 *
 * Agent-style endpoints call back into the generation API, so they need spend
 * authority — but never the caller's own key. They get a run token instead:
 * short-lived, no account scope, and billed to the caller's key.
 *
 * Returns undefined when delegation is not possible (no signing secret, or an
 * unauthenticated request); the endpoint then receives no spend credential at
 * all, which is the safe direction.
 */
async function resolveRunToken(
    auth: RequestAuth | undefined,
    endpoint: CommunityEndpointRuntime,
    runTokenSecret: string | undefined,
): Promise<string | undefined> {
    const userId = auth?.user?.id;
    const apiKey = auth?.apiKey;
    if (!runTokenSecret || !userId || !apiKey?.id) return undefined;

    // Already running under a run token — forward it unchanged. Minting a fresh
    // one per hop would let a chain of agents keep pushing the deadline out.
    if (apiKey.metadata?.runId) return apiKey.rawKey;

    return mintRunToken(
        {
            userId,
            apiKeyId: apiKey.id,
            runId: crypto.randomUUID(),
            agentId: endpoint.modelId,
        },
        runTokenSecret,
    );
}

export async function communityEndpointGatewayContext(
    endpoint: CommunityEndpointRuntime,
    modelDefinition: ModelDefinition,
    requestData: RequestData,
    secret: string,
    portkeyGatewayUrl: string,
    userApiKey: string,
    auth?: RequestAuth,
    runTokenSecret?: string,
): Promise<TransformOptions> {
    const bearerToken = await decryptSecret(
        endpoint.bearerTokenCiphertext,
        secret,
    );
    const { messages: _messages, ...requestDataWithoutMessages } = requestData;
    const runToken = await resolveRunToken(auth, endpoint, runTokenSecret);

    return {
        ...requestDataWithoutMessages,
        modelConfig: {
            provider: "openai",
            "custom-host": communityOpenAIBaseUrl(endpoint.baseUrl),
            // Authorization proves we may call this endpoint at all; the run
            // token is what it may spend. Two credentials, two headers.
            authKey: normalizeCommunityEndpointBearerToken(bearerToken),
            model: endpoint.upstreamModel,
            ...(runToken
                ? { forwardHeaders: { "X-Pollinations-Key": runToken } }
                : {}),
        },
        modelDef: modelDefinition,
        requestedModel: endpoint.modelId,
        portkeyGatewayUrl,
        userApiKey,
    };
}
