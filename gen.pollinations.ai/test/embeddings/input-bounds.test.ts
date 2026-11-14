import { describe, expect, it } from "vitest";
import { CreateEmbeddingRequestSchema } from "@/schemas/embeddings.ts";

describe("CreateEmbeddingRequestSchema input", () => {
    it("rejects an empty input array", () => {
        const parsed = CreateEmbeddingRequestSchema.safeParse({ input: [] });

        expect(parsed.success).toBe(false);
        if (!parsed.success) {
            expect(parsed.error.issues[0]?.path).toEqual(["input"]);
        }
    });

    it("keeps accepting a single string and a non-empty array", () => {
        const single = CreateEmbeddingRequestSchema.parse({ input: "hello" });
        expect(single.input).toBe("hello");

        const batch = CreateEmbeddingRequestSchema.parse({
            input: ["hello", "world"],
        });
        expect(batch.input).toEqual(["hello", "world"]);
    });
});
