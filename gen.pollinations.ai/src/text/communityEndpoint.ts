import {
    type CommunityEndpointRuntime,
    communityModelDefinition,
    communityOpenAIBaseUrl,
    normalizeCommunityEndpointBearerToken,
} from "@shared/community-endpoints.ts";
import { decryptSecret } from "@shared/secret-encryption.ts";
import type { RequestData, TransformOptions } from "./types.js";

export async function communityEndpointGatewayContext(
    endpoint: CommunityEndpointRuntime,
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
        modelDef: communityModelDefinition(endpoint),
        dynamicModelDef: true,
        requestedModel: endpoint.modelId,
        portkeyGatewayUrl,
        userApiKey,
    };
}
