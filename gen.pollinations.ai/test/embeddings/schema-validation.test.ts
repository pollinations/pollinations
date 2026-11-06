import { describe, expect, it } from "vitest";
import { CreateEmbeddingRequestSchema } from "@/schemas/embeddings.ts";

describe("CreateEmbeddingRequestSchema", () => {
    it("rejects an empty input array", () => {
        expect(() =>
            CreateEmbeddingRequestSchema.parse({
                model: "openai/text-embedding-3-small",
                input: [],
            }),
        ).toThrow();
    });

    it("rejects an empty array of content parts", () => {
        expect(() =>
            CreateEmbeddingRequestSchema.parse({
                model: "openai/text-embedding-3-small",
                input: [],
            }),
        ).toThrow();
    });

    it("accepts a non-empty array of strings", () => {
        expect(() =>
            CreateEmbeddingRequestSchema.parse({
                model: "openai/text-embedding-3-small",
                input: ["hello", "world"],
            }),
        ).not.toThrow();
    });

    it("accepts a string input", () => {
        expect(() =>
            CreateEmbeddingRequestSchema.parse({
                model: "openai/text-embedding-3-small",
                input: "hello",
            }),
        ).not.toThrow();
    });
});
