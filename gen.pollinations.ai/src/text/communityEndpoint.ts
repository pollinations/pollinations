import {
    type CommunityEndpointRuntime,
    capCommunityUsage,
    communityChatCompletionsUrl,
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
    const completion = await genericOpenAIClient(
        requestData.messages,
        {
            ...requestData,
            model: endpoint.upstreamModel,
            stream: false,
        },
        {
            endpoint: communityChatCompletionsUrl(endpoint.baseUrl),
            additionalHeaders: {
                Authorization: `Bearer ${bearerToken}`,
            },
        },
    );

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
