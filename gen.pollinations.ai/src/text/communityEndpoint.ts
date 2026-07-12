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
    modelDefinition: ModelDefinition<string>,
    requestData: RequestData,
    secret: string,
    portkeyGatewayUrl: string,
    userApiKey: string,
): Promise<TransformOptions> {
    const bearerToken = await decryptSecret(
        endpoint.bearerTokenCiphertext,
        secret,
    );
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
