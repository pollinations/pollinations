import { signAgentRunToken } from "@shared/auth/agent-run-token.ts";
import {
    type CommunityEndpointRuntime,
    communityOpenAIBaseUrl,
    normalizeCommunityEndpointBearerToken,
} from "@shared/community-endpoints.ts";
import type { ModelDefinition } from "@shared/registry/registry.ts";
import { decryptSecret } from "@shared/secret-encryption.ts";
import type { RequestData, TransformOptions } from "./types.js";

const DELEGATED_COMMUNITY_AGENTS = new Set(["itachi-1824/polli"]);

export function isDelegatedCommunityAgent(
    endpoint: CommunityEndpointRuntime,
): boolean {
    return DELEGATED_COMMUNITY_AGENTS.has(endpoint.modelId.toLowerCase());
}

export async function communityEndpointGatewayContext(
    endpoint: CommunityEndpointRuntime,
    modelDefinition: ModelDefinition,
    requestData: RequestData,
    secret: string,
    portkeyGatewayUrl: string,
    userApiKey: string,
    parentApiKeyId?: string,
    isNestedAgentRun = false,
): Promise<TransformOptions> {
    const delegatesGeneration = isDelegatedCommunityAgent(endpoint);
    if (delegatesGeneration && isNestedAgentRun) {
        throw new Error("Agent run tokens cannot call community models");
    }
    if (delegatesGeneration && !parentApiKeyId) {
        throw new Error("Delegated community agents require an API key");
    }

    const bearerToken = delegatesGeneration
        ? await signAgentRunToken({
              secret,
              parentApiKeyId: parentApiKeyId as string,
              agentId: endpoint.modelId,
              runId: crypto.randomUUID(),
          })
        : await decryptSecret(endpoint.bearerTokenCiphertext, secret);
    const { messages: _messages, ...requestDataWithoutMessages } = requestData;

    return {
        ...requestDataWithoutMessages,
        modelConfig: {
            provider: "openai",
            "custom-host": communityOpenAIBaseUrl(endpoint.baseUrl),
            authKey: normalizeCommunityEndpointBearerToken(bearerToken),
            model: endpoint.upstreamModel,
        },
        modelDef: modelDefinition,
        requestedModel: endpoint.modelId,
        portkeyGatewayUrl,
        userApiKey,
    };
}
