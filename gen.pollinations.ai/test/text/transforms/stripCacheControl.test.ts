import { describe, expect, it } from "vitest";
import { stripCacheControl } from "../../../src/text/transforms/stripCacheControl.js";

describe("stripCacheControl", () => {
    it("strips cache_control from typed text content parts", () => {
        const messages = [
            {
                role: "user" as const,
                content: [
                    {
                        type: "text",
                        text: "hi",
                        cache_control: { type: "ephemeral" },
                    },
                ],
            },
        ];

        const { messages: result } = stripCacheControl(messages, {});

        expect(result[0].content).toEqual([{ type: "text", text: "hi" }]);
    });

    it("leaves plain string content untouched (identity preserved)", () => {
        const messages = [{ role: "user" as const, content: "hello" }];

        const { messages: result } = stripCacheControl(messages, {});

        expect(result[0]).toBe(messages[0]);
    });

    it("preserves messages with no cache_control (identity preserved)", () => {
        const messages = [
            {
                role: "user" as const,
                content: [{ type: "text", text: "hi" }],
            },
        ];

        const { messages: result } = stripCacheControl(messages, {});

        expect(result[0]).toBe(messages[0]);
    });
});
