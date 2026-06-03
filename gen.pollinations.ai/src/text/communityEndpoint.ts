import {
    type CommunityEndpointRuntime,
    communityChatCompletionsUrl,
    normalizeCommunityEndpointBearerToken,
} from "@shared/community-endpoints.ts";
import { decryptSecret } from "@shared/secret-encryption.ts";
import { genericOpenAIClient } from "./genericOpenAIClient.js";
import type { ChatCompletion, RequestData, ServiceError } from "./types.js";

const DATA_PREFIX = /^data:\s?/;

export async function generateCommunityEndpointCompletion(
    endpoint: CommunityEndpointRuntime,
    requestData: RequestData,
    secret: string,
): Promise<ChatCompletion> {
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
                stream: requestData.stream === true,
                stream_options: requestData.stream
                    ? {
                          ...requestData.stream_options,
                          include_usage: true,
                      }
                    : requestData.stream_options,
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
    if (completion.stream) {
        completion.responseStream = transformCommunityEndpointStream(
            completion.responseStream,
            endpoint,
        );
        return completion;
    }

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

function transformCommunityEndpointStream(
    stream: ReadableStream | null | undefined,
    endpoint: CommunityEndpointRuntime,
): ReadableStream | null | undefined {
    if (!stream) return stream;

    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buffer = "";

    return stream.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
                buffer += decoder.decode(chunk, { stream: true });
                const lines = buffer.split(/\r?\n/);
                buffer = lines.pop() ?? "";
                for (const line of lines) {
                    controller.enqueue(
                        encoder.encode(
                            transformCommunityEndpointStreamLine(
                                line,
                                endpoint,
                            ),
                        ),
                    );
                }
            },
            flush(controller) {
                const tail = buffer + decoder.decode();
                if (!tail) return;
                for (const line of tail.split(/\r?\n/)) {
                    controller.enqueue(
                        encoder.encode(
                            transformCommunityEndpointStreamLine(
                                line,
                                endpoint,
                            ),
                        ),
                    );
                }
            },
        }),
    );
}

function transformCommunityEndpointStreamLine(
    line: string,
    endpoint: CommunityEndpointRuntime,
): string {
    if (!line.startsWith("data:")) return `${line}\n`;

    const data = line.replace(DATA_PREFIX, "").trim();
    if (!data || data === "[DONE]") return `${line}\n`;

    try {
        const event = JSON.parse(data) as Record<string, unknown>;
        event.model = endpoint.modelId;
        return `data: ${JSON.stringify(event)}\n`;
    } catch {
        return `${line}\n`;
    }
}
