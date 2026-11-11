import {
    CreateImageEditRequestSchema,
    CreateImageRequestSchema,
} from "@shared/schemas/openai.ts";
import { describe, expect, it } from "vitest";
import { CreateEmbeddingRequestSchema } from "@/schemas/embeddings.ts";

describe("explicit empty model strings", () => {
    it("rejects an empty model on image generation", () => {
        expect(() =>
            CreateImageRequestSchema.parse({
                prompt: "a red apple",
                model: "",
            }),
        ).toThrow();
    });

    it("rejects an empty model on image edits", () => {
        expect(() =>
            CreateImageEditRequestSchema.parse({
                prompt: "make it blue",
                image: "https://example.com/image.png",
                model: "",
            }),
        ).toThrow();
    });

    it("rejects an empty model on embeddings", () => {
        expect(() =>
            CreateEmbeddingRequestSchema.parse({
                input: "hello",
                model: "",
            }),
        ).toThrow();
    });

    it("still defaults when the model is omitted", () => {
        expect(
            CreateImageRequestSchema.parse({ prompt: "a red apple" }).model,
        ).toBe("black-forest-labs/flux.1-schnell");
        expect(
            CreateEmbeddingRequestSchema.parse({ input: "hello" }).model,
        ).toBeTruthy();
    });
});
