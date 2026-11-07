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

function parseEffort(effort: unknown) {
    return CreateMessageRequestSchema.safeParse({
        ...base,
        output_config: { effort },
    });
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

    it("requires budget_tokens when thinking is enabled", () => {
        const parsed = parseThinking({ type: "enabled" });

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

describe("CreateMessageRequestSchema output_config", () => {
    it("rejects an unknown effort instead of dropping it", () => {
        const parsed = parseEffort("banana");

        expect(parsed.success).toBe(false);
        if (!parsed.success) {
            expect(parsed.error.issues[0]?.path).toEqual([
                "output_config",
                "effort",
            ]);
        }
    });

    it("accepts the documented effort levels", () => {
        for (const effort of ["low", "medium", "high", "xhigh", "max"]) {
            expect(parseEffort(effort).success).toBe(true);
        }
    });
});
