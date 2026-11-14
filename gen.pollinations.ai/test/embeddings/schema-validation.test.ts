import { describe, expect, it } from "vitest";
import { CreateEmbeddingRequestSchema } from "../../src/schemas/embeddings.ts";

const model = "openai/text-embedding-3-small";
const parse = (input: unknown) =>
    CreateEmbeddingRequestSchema.safeParse({ model, input });

describe("CreateEmbeddingRequestSchema input", () => {
    it("rejects an empty input array", () => {
        expect(parse([]).success).toBe(false);
    });

    it("rejects an empty array of content parts", () => {
        expect(parse([]).success).toBe(false);
    });

    it("rejects an empty scalar string", () => {
        expect(parse("").success).toBe(false);
    });

    it("rejects an empty string inside an array", () => {
        expect(parse(["", "hello"]).success).toBe(false);
        expect(parse(["hello", ""]).success).toBe(false);
    });

    it("rejects a text content part with empty text", () => {
        expect(parse([{ type: "text", text: "" }]).success).toBe(false);
    });

    it("accepts non-empty strings", () => {
        expect(parse("hello").success).toBe(true);
        expect(parse(["hello", "world"]).success).toBe(true);
        expect(parse([{ type: "text", text: "hello" }]).success).toBe(true);
    });

    it("accepts whitespace-only strings", () => {
        expect(parse(" ").success).toBe(true);
        expect(parse([" ", "hello"]).success).toBe(true);
    });
});
