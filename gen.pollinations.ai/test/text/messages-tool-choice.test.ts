import { describe, expect, it } from "vitest";
import { CreateMessageRequestSchema } from "@/text/messages/schema.ts";

const base = {
    model: "openai/gpt-5.4-nano",
    max_tokens: 1024,
    messages: [{ role: "user", content: "hi" }],
    tools: [{ name: "get_weather", input_schema: { type: "object" } }],
};

function parseToolChoice(tool_choice: unknown) {
    return CreateMessageRequestSchema.safeParse({ ...base, tool_choice });
}

describe("CreateMessageRequestSchema tool_choice", () => {
    it("rejects type tool without a name", () => {
        const parsed = parseToolChoice({ type: "tool" });

        expect(parsed.success).toBe(false);
        if (!parsed.success) {
            expect(parsed.error.issues[0]?.path).toEqual([
                "tool_choice",
                "name",
            ]);
        }
    });

    it("accepts type tool with a name", () => {
        const parsed = parseToolChoice({ type: "tool", name: "get_weather" });

        expect(parsed.success).toBe(true);
    });

    it("keeps the other tool_choice modes working", () => {
        for (const type of ["auto", "any", "none"]) {
            expect(parseToolChoice({ type }).success).toBe(true);
        }
    });
});
