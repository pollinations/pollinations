import {
    CreateChatCompletionRequestSchema,
    CreateResponseRequestSchema,
} from "@shared/schemas/openai.ts";
import { describe, expect, it } from "vitest";

const userMessage = (content: string) => [{ role: "user" as const, content }];

describe("CreateChatCompletionRequestSchema empty values", () => {
    it("rejects empty message content", () => {
        expect(() =>
            CreateChatCompletionRequestSchema.parse({
                messages: userMessage(""),
            }),
        ).toThrow();

        expect(() =>
            CreateChatCompletionRequestSchema.parse({
                messages: [
                    { role: "system", content: "" },
                    { role: "user", content: "hi" },
                ],
            }),
        ).toThrow();
    });

    it("rejects an empty stop string and empty array entries", () => {
        expect(() =>
            CreateChatCompletionRequestSchema.parse({
                messages: userMessage("hi"),
                stop: "",
            }),
        ).toThrow();

        expect(() =>
            CreateChatCompletionRequestSchema.parse({
                messages: userMessage("hi"),
                stop: [""],
            }),
        ).toThrow();
    });

    it("rejects an empty user", () => {
        expect(() =>
            CreateChatCompletionRequestSchema.parse({
                messages: userMessage("hi"),
                user: "",
            }),
        ).toThrow();
    });

    it("rejects unknown service_tier values", () => {
        expect(() =>
            CreateChatCompletionRequestSchema.parse({
                messages: userMessage("hi"),
                service_tier: "invalid",
            }),
        ).toThrow();
    });

    it("accepts supported service_tier values", () => {
        for (const service_tier of [
            "auto",
            "default",
            "flex",
            "scale",
            "priority",
        ]) {
            expect(() =>
                CreateChatCompletionRequestSchema.parse({
                    messages: userMessage("hi"),
                    service_tier,
                }),
            ).not.toThrow();
        }
    });
});

describe("CreateResponseRequestSchema empty values", () => {
    const response = (extra: Record<string, unknown>) => ({
        model: "openai/gpt-4o-mini",
        input: "hi",
        max_output_tokens: 16,
        ...extra,
    });

    it("rejects an empty user", () => {
        expect(() =>
            CreateResponseRequestSchema.parse(response({ user: "" })),
        ).toThrow();
    });

    it("rejects unknown service_tier values", () => {
        expect(() =>
            CreateResponseRequestSchema.parse(
                response({ service_tier: "invalid" }),
            ),
        ).toThrow();
    });

    it("accepts supported service_tier values", () => {
        for (const service_tier of [
            "auto",
            "default",
            "flex",
            "scale",
            "priority",
        ]) {
            expect(() =>
                CreateResponseRequestSchema.parse(response({ service_tier })),
            ).not.toThrow();
        }
    });
});
