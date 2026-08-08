import type { CreateChatCompletionRequest } from "@shared/schemas/openai.ts";
import type { GenerateTextRequestQueryParams } from "@/schemas/text.ts";
import type { ChatMessage, RequestData } from "./types.js";

const MAX_SEED_VALUE = 2147483647;

function resolveSeed(seed: number | null | undefined) {
    if (seed == null) return undefined;
    return seed === -1 ? Math.floor(Math.random() * MAX_SEED_VALUE) : seed;
}

function requestsJson(json: unknown, jsonMode: unknown): boolean {
    return (
        Boolean(jsonMode) ||
        json === true ||
        (typeof json === "string" && json.toLowerCase() === "true")
    );
}

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
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
    const messages = [...requestData.messages] as ChatMessage[];
    if (typeof system === "string" && system) {
        messages.unshift({ role: "system", content: system });
    }

    const responseFormat =
        requestData.response_format ??
        (requestsJson(json, jsonMode) ? { type: "json_object" } : undefined);

    const request = {
        ...requestData,
        messages,
    } as RequestData;
    const seed = resolveSeed(request.seed);
    if (seed === undefined) delete request.seed;
    else request.seed = seed;
    if (responseFormat) request.response_format = responseFormat;
    return request;
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
    const messages: ChatMessage[] = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });

    const request: RequestData = {
        ...options,
        model,
        messages,
    };
    const seed = resolveSeed(request.seed);
    if (seed !== undefined) request.seed = seed;
    if (request.temperature !== undefined)
        request.temperature = clamp(request.temperature, 0, 3);
    if (request.top_p !== undefined) request.top_p = clamp(request.top_p, 0, 1);
    if (request.presence_penalty !== undefined)
        request.presence_penalty = clamp(request.presence_penalty, -2, 2);
    if (request.frequency_penalty !== undefined)
        request.frequency_penalty = clamp(request.frequency_penalty, -2, 2);
    if (json) request.response_format = { type: "json_object" };
    return request;
}
