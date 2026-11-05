import { describe, expect, it } from "vitest";
import { CreateMessageRequestSchema } from "@/text/messages/schema.ts";

const base = {
    model: "openai/gpt-4o-mini",
    max_tokens: 8,
    messages: [{ role: "user", content: "hi" }],
};

describe("CreateMessageRequestSchema tool_choice", () => {
    it("accepts tool_choice.type 'tool' with a name", () => {
        expect(() =>
            CreateMessageRequestSchema.parse({
                ...base,
                tools: [{ name: "x", input_schema: { type: "object" } }],
                tool_choice: { type: "tool", name: "x" },
            }),
        ).not.toThrow();
    });

    it("rejects tool_choice.type 'tool' without a name", () => {
        expect(() =>
            CreateMessageRequestSchema.parse({
                ...base,
                tools: [{ name: "x", input_schema: { type: "object" } }],
                tool_choice: { type: "tool" },
            }),
        ).toThrow();
    });

    it("rejects tool_choice.type 'tool' with an empty name", () => {
        expect(() =>
            CreateMessageRequestSchema.parse({
                ...base,
                tools: [{ name: "x", input_schema: { type: "object" } }],
                tool_choice: { type: "tool", name: "" },
            }),
        ).toThrow();
    });
});

describe("CreateMessageRequestSchema thinking", () => {
    it("accepts enabled thinking with budget_tokens >= 1024", () => {
        expect(() =>
            CreateMessageRequestSchema.parse({
                ...base,
                thinking: { type: "enabled", budget_tokens: 1024 },
            }),
        ).not.toThrow();
    });

    it("rejects an unknown thinking type", () => {
        expect(() =>
            CreateMessageRequestSchema.parse({
                ...base,
                thinking: { type: "banana" },
            }),
        ).toThrow();
    });

    it("rejects negative budget_tokens", () => {
        expect(() =>
            CreateMessageRequestSchema.parse({
                ...base,
                thinking: { type: "enabled", budget_tokens: -100 },
            }),
        ).toThrow();
    });

    it("rejects budget_tokens below 1024", () => {
        expect(() =>
            CreateMessageRequestSchema.parse({
                ...base,
                thinking: { type: "enabled", budget_tokens: 512 },
            }),
        ).toThrow();
    });

    it("rejects budget_tokens without type enabled", () => {
        expect(() =>
            CreateMessageRequestSchema.parse({
                ...base,
                thinking: { type: "disabled", budget_tokens: 2048 },
            }),
        ).toThrow();
    });
});
