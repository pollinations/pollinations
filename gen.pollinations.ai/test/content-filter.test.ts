import { CreateChatCompletionResponseSchema } from "@shared/schemas/openai.ts";
import { describe, expect, it } from "vitest";
import { mergeContentFilterResults } from "../src/content-filter.ts";

describe("provider content filter metadata", () => {
    it("accepts Novita filter results without Azure severity fields", () => {
        const response = CreateChatCompletionResponseSchema.parse({
            id: "novita-gemma-response",
            object: "chat.completion",
            created: 1791827182,
            model: "google/gemma-4-26b-a4b-it",
            choices: [
                {
                    index: 0,
                    message: { role: "assistant", content: "violet" },
                    finish_reason: "stop",
                    content_filter_results: {
                        hate: { filtered: false },
                        self_harm: { filtered: false },
                        sexual: { filtered: false },
                        violence: { filtered: false },
                        jailbreak: { filtered: false, detected: false },
                    },
                },
            ],
            usage: {
                prompt_tokens: 63,
                completion_tokens: 2,
                total_tokens: 65,
            },
        });
        expect(response.choices[0].content_filter_results?.hate).toEqual({
            filtered: false,
        });
        expect(response.usage?.total_tokens).toBe(65);
    });

    it("preserves blocking flags and known severity when some chunks omit it", () => {
        const results = [
            { hate: { filtered: true } },
            { hate: { filtered: false, severity: "high" as const } },
        ];
        for (const order of [results, [...results].reverse()]) {
            expect(mergeContentFilterResults(order).hate).toEqual({
                filtered: true,
                severity: "high",
            });
        }
        expect(
            mergeContentFilterResults([{ hate: { filtered: true } }]).hate,
        ).toEqual({ filtered: true });
    });
});
