import type { CreateChatCompletionRequest } from "@shared/schemas/openai.ts";
import type { GenerateTextRequestQueryParams } from "@/schemas/text.ts";
import type { ChatMessage, RequestData } from "./types.js";

function normalizeTextSeed(seed: number): number {
    return seed === -1 ? Math.floor(Math.random() * 2147483648) : seed;
}

export function requestsJson(json: unknown, jsonMode: unknown): boolean {
    return (
        Boolean(jsonMode) ||
        json === true ||
        (typeof json === "string" && json.toLowerCase() === "true")
    );
}

export function getChatRequestData(
    body: CreateChatCompletionRequest & Record<string, unknown>,
): RequestData {
    const {
        safe: _safe,
        system,
        json,
        jsonMode,
        thinking: _thinking,
        thinking_budget: _thinkingBudget,
        ...requestData
    } = body;
    const messages = [
        ...(typeof system === "string" && system
            ? [{ role: "system", content: system }]
            : []),
        ...requestData.messages,
    ] as ChatMessage[];
    const seed =
        requestData.seed == null
            ? {}
            : { seed: normalizeTextSeed(requestData.seed) };
    const responseFormat =
        !requestData.response_format && requestsJson(json, jsonMode)
            ? { response_format: { type: "json_object" } as const }
            : {};

    return {
        ...requestData,
        ...seed,
        ...responseFormat,
        messages,
    } as RequestData;
}

export function getSimpleTextRequestData(
    prompt: string,
    model: string,
    query: GenerateTextRequestQueryParams,
): RequestData {
    const {
        safe: _safe,
        system,
        json,
        model: _requestedModel,
        ...options
    } = query;
    const messages: ChatMessage[] = [
        ...(system ? [{ role: "system", content: system }] : []),
        { role: "user", content: prompt },
    ];

    return {
        ...options,
        model,
        messages,
        ...(options.seed !== undefined
            ? { seed: normalizeTextSeed(options.seed) }
            : {}),
        ...(json ? { response_format: { type: "json_object" } } : {}),
    };
}
