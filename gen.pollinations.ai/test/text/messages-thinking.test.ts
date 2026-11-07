import { describe, expect, it } from "vitest";
import { CreateMessageRequestSchema } from "@/text/messages/schema.ts";

const base = {
    model: "openai/gpt-5.4-nano",
    max_tokens: 1024,
    messages: [{ role: "user", content: "hi" }],
};

function parseThinking(thinking: unknown) {
    return CreateMessageRequestSchema.safeParse({ ...base, thinking });
}

describe("CreateMessageRequestSchema thinking", () => {
    it("rejects an unsupported thinking type", () => {
        const parsed = parseThinking({ type: "banana" });

        expect(parsed.success).toBe(false);
        if (!parsed.success) {
            expect(parsed.error.issues[0]?.path).toEqual(["thinking", "type"]);
        }
    });

    it("rejects budget_tokens below the 1024 minimum", () => {
        const parsed = parseThinking({ type: "enabled", budget_tokens: 100 });

        expect(parsed.success).toBe(false);
        if (!parsed.success) {
            expect(parsed.error.issues[0]?.path).toEqual([
                "thinking",
                "budget_tokens",
            ]);
        }
    });

    it("accepts supported thinking settings", () => {
        for (const thinking of [
            { type: "enabled", budget_tokens: 1024 },
            { type: "disabled" },
            { type: "adaptive" },
        ]) {
            expect(parseThinking(thinking).success).toBe(true);
        }
    });
});
