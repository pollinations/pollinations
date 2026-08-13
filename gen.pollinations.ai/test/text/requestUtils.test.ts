import { CreateChatCompletionRequestSchema } from "@shared/schemas/openai.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GenerateTextRequestQueryParamsSchema } from "../../src/schemas/text.js";
import {
    getChatRequestData,
    getSimpleTextRequestData,
} from "../../src/text/requestUtils.js";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("getChatRequestData", () => {
    it("preserves validated OpenAI and provider fields", () => {
        const body = CreateChatCompletionRequestSchema.parse({
            model: "openai-fast",
            messages: [
                {
                    role: "user",
                    content: "hello",
                    cache_control: { type: "ephemeral" },
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
                    cache_control: { type: "ephemeral" },
                    provider_message_option: "kept",
                },
            ],
            parallel_tool_calls: false,
            function_call: "auto",
            functions: [{ name: "lookup" }],
            provider_request_option: { mode: "fast" },
        });
    });

    it("keeps supported Pollinations aliases out of the upstream body", () => {
        vi.spyOn(Math, "random").mockReturnValue(0.5);
        const request = getChatRequestData(
            CreateChatCompletionRequestSchema.parse({
                model: "openai-fast",
                messages: [{ role: "user", content: "hello" }],
                safe: "privacy",
                system: "Be concise",
                json: true,
                seed: -1,
            }),
        );

        expect(request.messages).toEqual([
            { role: "system", content: "Be concise" },
            { role: "user", content: "hello" },
        ]);
        expect(request.response_format).toEqual({ type: "json_object" });
        expect(request.seed).toBe(1073741823);
        expect(request).not.toHaveProperty("safe");
        expect(request).not.toHaveProperty("system");
        expect(request).not.toHaveProperty("json");
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

    it("does not revive retired thinking aliases", () => {
        const request = getChatRequestData(
            CreateChatCompletionRequestSchema.parse({
                model: "openai-fast",
                messages: [{ role: "user", content: "hello" }],
                thinking: { type: "enabled", budget_tokens: 1024 },
                thinking_budget: 1024,
                reasoning_effort: "medium",
            }),
        );

        expect(request.reasoning_effort).toBe("medium");
        expect(request).not.toHaveProperty("thinking");
        expect(request).not.toHaveProperty("thinking_budget");
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

    it("does not invent generation options when they are omitted", () => {
        const query = GenerateTextRequestQueryParamsSchema.parse({});

        expect(
            getSimpleTextRequestData("hello", "resolved-model", query),
        ).toEqual({
            model: "resolved-model",
            messages: [{ role: "user", content: "hello" }],
        });
    });

    it("preserves the existing GET-only option clamping", () => {
        const query = GenerateTextRequestQueryParamsSchema.parse({
            temperature: "4",
            top_p: "-1",
            presence_penalty: "3",
            frequency_penalty: "-3",
        });

        expect(
            getSimpleTextRequestData("hello", "resolved-model", query),
        ).toMatchObject({
            temperature: 3,
            top_p: 0,
            presence_penalty: 2,
            frequency_penalty: -2,
        });
    });

    it("preserves permissive coercion for legacy GET-only options", () => {
        const query = GenerateTextRequestQueryParamsSchema.parse({
            top_p: "0.8 trailing",
            max_tokens: "16 tokens",
            repetition_penalty: "invalid",
        });

        expect(query).toMatchObject({ top_p: 0.8, max_tokens: 16 });
        expect(query.repetition_penalty).toBeUndefined();
    });
});
