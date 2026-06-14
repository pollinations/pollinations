import {
    type CommunityEndpointRuntime,
    communityOpenAIBaseUrl,
    communityPriceDefinition,
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
        modelDef: {
            aliases: [],
            provider: "community",
            brand: "Community",
            category: "text",
            cost: communityPriceDefinition(endpoint),
            priceMultiplier: 1,
            addedDate: 0,
            title: endpoint.description?.trim() || endpoint.modelId,
            inputModalities: ["text"],
            outputModalities: ["text"],
            contextLength: endpoint.contextLength ?? undefined,
        },
        dynamicModelDef: true,
        requestedModel: endpoint.modelId,
        portkeyGatewayUrl,
        userApiKey,
    };
}
