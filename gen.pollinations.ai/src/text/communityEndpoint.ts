import {
    type CommunityEndpointRuntime,
    communityOpenAIBaseUrl,
    normalizeCommunityEndpointBearerToken,
} from "@shared/community-endpoints.ts";
import type { ModelDefinition } from "@shared/registry/registry.ts";
import { decryptSecret } from "@shared/secret-encryption.ts";
import type { RequestData, TransformOptions } from "./types.js";

export async function communityEndpointGatewayContext(
    endpoint: CommunityEndpointRuntime,
    modelDefinition: ModelDefinition,
    requestData: RequestData,
    secret: string,
    agentRuntimeToken: string,
    portkeyGatewayUrl: string,
    userApiKey: string,
): Promise<TransformOptions> {
    let authKey = agentRuntimeToken;
    if (!endpoint.agentId) {
        if (!endpoint.bearerTokenCiphertext) {
            throw new Error("Community endpoint has no bearer token");
        }
        authKey = normalizeCommunityEndpointBearerToken(
            await decryptSecret(endpoint.bearerTokenCiphertext, secret),
        );
    }
    const { messages: _messages, ...requestDataWithoutMessages } = requestData;

    return {
        ...requestDataWithoutMessages,
        modelConfig: {
            provider: "openai",
            "custom-host": communityOpenAIBaseUrl(endpoint.baseUrl),
            authKey,
            model: endpoint.agentId ?? endpoint.upstreamModel,
        },
        modelDef: modelDefinition,
        requestedModel: endpoint.modelId,
        portkeyGatewayUrl,
        userApiKey,
    };
}
