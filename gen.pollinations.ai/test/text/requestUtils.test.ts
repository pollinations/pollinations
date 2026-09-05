import { CreateChatCompletionRequestSchema } from "@shared/schemas/openai.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenerateTextRequestQueryParamsSchema } from "../../src/schemas/text.js";
import {
    getChatRequestData,
    getSimpleTextRequestData,
} from "../../src/text/requestUtils.js";
import { chatToResponsesRequest } from "../../src/text/responses/chatRequest.js";
import { SENTINEL_SEED } from "../../src/util.js";

afterEach(() => vi.restoreAllMocks());

describe("getChatRequestData", () => {
    it("preserves validated OpenAI and provider fields", () => {
        const body = CreateChatCompletionRequestSchema.parse({
            model: "openai-fast",
            messages: [
                {
                    role: "user",
                    content: "hello",
                    provider_message_option: "kept",
                },
            ],
            parallel_tool_calls: false,
            function_call: "auto",
            functions: [{ name: "lookup" }],
            provider_request_option: { mode: "fast" },
        });

        expect(getChatRequestData(body)).toMatchObject({
            model: "openai-fast",
            messages: [
                {
                    role: "user",
                    content: "hello",
                    provider_message_option: "kept",
                },
            ],
            parallel_tool_calls: false,
            function_call: "auto",
            functions: [{ name: "lookup" }],
            provider_request_option: { mode: "fast" },
        });
    });

    it("applies aliases without forwarding SDK-owned controls", () => {
        const request = getChatRequestData(
            CreateChatCompletionRequestSchema.parse({
                model: "openai-fast",
                messages: [{ role: "user", content: "hello" }],
                safe: "privacy",
                system: "Be concise",
                json: true,
                seed: -1,
                thinking: { type: "enabled", budget_tokens: 1024 },
                thinking_budget: 1024,
                reasoning_effort: "medium",
            }),
        );

        expect(request.messages).toEqual([
            { role: "system", content: "Be concise" },
            { role: "user", content: "hello" },
        ]);
        expect(request.response_format).toEqual({ type: "json_object" });
        expect(request.seed).toBe(SENTINEL_SEED);
        expect(request.reasoning_effort).toBe("medium");
        for (const field of [
            "safe",
            "system",
            "json",
            "thinking",
            "thinking_budget",
        ]) {
            expect(request).not.toHaveProperty(field);
        }
    });

    it("prefers the standard response_format over the json alias", () => {
        const request = getChatRequestData(
            CreateChatCompletionRequestSchema.parse({
                model: "openai-fast",
                messages: [{ role: "user", content: "hello" }],
                json: true,
                response_format: { type: "text" },
            }),
        );
        expect(request.response_format).toEqual({ type: "text" });
    });
});

describe("getSimpleTextRequestData", () => {
    it("uses the validated GET query without reparsing it", () => {
        const query = GenerateTextRequestQueryParamsSchema.parse({
            model: "openai-fast",
            seed: "12",
            system: "Be concise",
            json: "true",
            temperature: "0.5",
            top_p: "0.8",
            max_tokens: "16",
            stream: "false",
        });

        expect(
            getSimpleTextRequestData("hello", "resolved-model", query),
        ).toEqual({
            model: "resolved-model",
            messages: [
                { role: "system", content: "Be concise" },
                { role: "user", content: "hello" },
            ],
            seed: 12,
            temperature: 0.5,
            top_p: 0.8,
            max_tokens: 16,
            stream: false,
            response_format: { type: "json_object" },
        });
    });

    it("does not introduce a seed when the caller omits it", () => {
        const query = GenerateTextRequestQueryParamsSchema.parse({});
        expect(
            getSimpleTextRequestData("hello", "resolved-model", query),
        ).toEqual({
            model: "resolved-model",
            messages: [{ role: "user", content: "hello" }],
            stream: false,
        });
    });

    it.each([0, 12, -1])("preserves an explicit seed %s", (seed) => {
        const query = GenerateTextRequestQueryParamsSchema.parse({ seed });
        expect(getSimpleTextRequestData("hello", "openai", query).seed).toBe(
            seed === -1 ? SENTINEL_SEED : seed,
        );
    });

    it("allows an ordinary simple-text request through the Responses adapter", () => {
        const query = GenerateTextRequestQueryParamsSchema.parse({
            model: "gpt-5.6-terra",
        });
        const request = getSimpleTextRequestData("hello", query.model, query);
        expect(chatToResponsesRequest(request.messages, request)).toMatchObject(
            {
                model: "gpt-5.6-terra",
                stream: false,
            },
        );
        expect(() =>
            chatToResponsesRequest(request.messages, { ...request, seed: 0 }),
        ).toThrow("seed is not supported");
    });

    it("leaves numeric normalization to the provider pipeline", () => {
        const query = GenerateTextRequestQueryParamsSchema.parse({
            temperature: "4",
            top_p: "-1 trailing",
            presence_penalty: "3",
            frequency_penalty: "-3",
            max_tokens: "16 tokens",
            repetition_penalty: "invalid",
        });
        expect(
            getSimpleTextRequestData("hello", "resolved-model", query),
        ).toMatchObject({
            temperature: 4,
            top_p: -1,
            presence_penalty: 3,
            frequency_penalty: -3,
            max_tokens: 16,
        });
        expect(query.repetition_penalty).toBeUndefined();
    });
});
