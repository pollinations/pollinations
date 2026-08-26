import { describe, expect, it } from "vitest";
import {
    normalizeOptions,
    prepareMessages,
} from "../../src/text/textGenerationUtils.js";

describe("prepareMessages", () => {
    it("preserves message and content-block provider extensions", () => {
        const content = [
            {
                type: "text",
                text: "big static prefix",
                cache_control: { type: "ephemeral" },
            },
        ];
        const [message] = prepareMessages([
            {
                role: "system",
                content,
                provider_option: "kept",
            },
        ]);

        expect(message.content).toBe(content);
        expect(message.provider_option).toBe("kept");
    });

    it.each(["", "   ", []])("repairs empty user content %j", (content) => {
        expect(prepareMessages([{ role: "user", content }])).toEqual([
            { role: "user", content: "Please provide a response." },
        ]);
    });

    it("keeps missing tool-call content nullable", () => {
        expect(
            prepareMessages([
                {
                    role: "assistant",
                    tool_calls: [{ id: "call_1" }],
                },
            ]),
        ).toEqual([
            {
                role: "assistant",
                content: null,
                tool_calls: [{ id: "call_1" }],
            },
        ]);
    });

    it("rejects invalid semantic names and drops optional invalid names", () => {
        expect(() =>
            prepareMessages([
                { role: "tool", name: "invalid name", content: "result" },
            ]),
        ).toThrow("Invalid message name for role 'tool'");
        expect(
            prepareMessages([
                { role: "user", name: "invalid name", content: "hello" },
            ]),
        ).toEqual([{ role: "user", content: "hello" }]);
    });
});

describe("normalizeOptions", () => {
    it("retains compatibility defaults and bounds", () => {
        expect(
            normalizeOptions({
                temperature: 4,
                top_p: -1,
                presence_penalty: 3,
                frequency_penalty: -3,
                seed: 4.9,
                jsonMode: true,
            }),
        ).toEqual({
            stream: false,
            temperature: 3,
            top_p: 0,
            presence_penalty: 2,
            frequency_penalty: -2,
            seed: 4,
            response_format: { type: "json_object" },
        });
    });
});
