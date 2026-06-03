import {
    type CommunityEndpointRuntime,
    capCommunityUsage,
    communityChatCompletionsUrl,
    normalizeCommunityEndpointBearerToken,
} from "@shared/community-endpoints.ts";
import { decryptSecret } from "@shared/secret-encryption.ts";
import { genericOpenAIClient } from "./genericOpenAIClient.js";
import type { ChatCompletion, RequestData, ServiceError } from "./types.js";

export async function generateCommunityEndpointCompletion(
    endpoint: CommunityEndpointRuntime,
    requestData: RequestData,
    secret: string,
): Promise<ChatCompletion> {
    if (requestData.stream) {
        const error = new Error(
            "Community endpoints do not support streaming yet",
        ) as ServiceError;
        error.status = 400;
        throw error;
    }

    const bearerToken = await decryptSecret(
        endpoint.bearerTokenCiphertext,
        secret,
    );
    const authorization = `Bearer ${normalizeCommunityEndpointBearerToken(
        bearerToken,
    )}`;
    let completion: ChatCompletion;
    try {
        completion = await genericOpenAIClient(
            requestData.messages,
            {
                ...requestData,
                model: endpoint.upstreamModel,
                stream: false,
            },
            {
                endpoint: communityChatCompletionsUrl(endpoint.baseUrl),
                additionalHeaders: {
                    Authorization: authorization,
                },
            },
        );
    } catch (thrown) {
        const error = thrown as ServiceError;
        if (error.upstreamStatus === 401) {
            error.message = `Community endpoint rejected the saved bearer token after we sent it: ${error.message}`;
        }
        throw error;
    }

    completion.model = endpoint.modelId;
    completion.usage = capCommunityUsage(
        endpoint,
        requestData,
        completion.usage,
    );

    if (!completion.usage) {
        const error = new Error(
            "Community endpoint response missing usage",
        ) as ServiceError;
        error.status = 502;
        error.upstreamStatus = 502;
        throw error;
    }

    return completion;
}
