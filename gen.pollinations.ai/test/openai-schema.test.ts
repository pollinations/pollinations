import { CreateChatCompletionRequestSchema } from "@shared/schemas/openai.ts";
import { describe, expect, it } from "vitest";

describe("OpenAI request schema", () => {
    it("preserves provider extension fields", () => {
        const parsed = CreateChatCompletionRequestSchema.parse({
            model: "openai-fast",
            messages: [{ role: "user", content: "hi" }],
            metadata: { trace_id: "abc" },
            provider_metadata: { route: "test" },
        });

        expect(parsed.metadata).toEqual({ trace_id: "abc" });
        expect(parsed.provider_metadata).toEqual({ route: "test" });
    });
});
