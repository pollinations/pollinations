import { describe, expect, it } from "vitest";
import { sanitizeMessages } from "../../../src/text/transforms/messageSanitizer.js";

const baseOptions = {
    modelDef: { name: "kimi-k2.6" },
    requestedModel: "kimi-k2.6",
};

describe("sanitizeMessages", () => {
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

        const { messages: result } = sanitizeMessages(messages, baseOptions);

        expect(result[0].content).toEqual([{ type: "text", text: "hi" }]);
    });

    it("leaves plain string content untouched (identity preserved)", () => {
        const messages = [{ role: "user" as const, content: "hello" }];

        const { messages: result } = sanitizeMessages(messages, baseOptions);

        expect(result[0]).toBe(messages[0]);
    });

    it("still replaces empty user content with placeholder", () => {
        const messages = [{ role: "user" as const, content: "" }];

        const { messages: result } = sanitizeMessages(messages, baseOptions);

        expect(result[0].content).toBe("Please provide a response.");
    });
});
