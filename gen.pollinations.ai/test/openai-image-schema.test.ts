import {
    CreateImageEditRequestSchema,
    CreateImageRequestSchema,
} from "@shared/schemas/openai.ts";
import { describe, expect, it } from "vitest";

describe("CreateImageRequestSchema empty values", () => {
    it("rejects an empty image URL", () => {
        expect(() =>
            CreateImageRequestSchema.parse({
                prompt: "a red apple",
                image: "",
            }),
        ).toThrow();
    });

    it("rejects an empty image URL entry", () => {
        expect(() =>
            CreateImageRequestSchema.parse({
                prompt: "a red apple",
                image: ["https://example.com/image.png", ""],
            }),
        ).toThrow();
    });

    it("rejects an empty user", () => {
        expect(() =>
            CreateImageRequestSchema.parse({
                prompt: "a red apple",
                user: "",
            }),
        ).toThrow();
    });

    it("keeps image and user optional", () => {
        expect(() =>
            CreateImageRequestSchema.parse({ prompt: "a red apple" }),
        ).not.toThrow();
    });
});

describe("CreateImageEditRequestSchema empty values", () => {
    it("rejects an empty source image URL", () => {
        expect(() =>
            CreateImageEditRequestSchema.parse({
                prompt: "make it blue",
                image: "",
            }),
        ).toThrow();
    });

    it("rejects an empty image_url in the object form", () => {
        expect(() =>
            CreateImageEditRequestSchema.parse({
                prompt: "make it blue",
                image: [{ image_url: "" }],
            }),
        ).toThrow();
    });
});
