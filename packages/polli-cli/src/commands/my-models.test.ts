import { describe, expect, it } from "vitest";
import { modelBody } from "./my-models.js";

describe("modelBody", () => {
    it("builds image model registration fields supported by the API", () => {
        expect(
            modelBody(
                {
                    name: "image-provider",
                    title: "Image Provider",
                    baseUrl: "https://example.com/v1",
                    bearerToken: "upstream-token",
                    modality: "image",
                    imagePricing: "request",
                    inputModalities: "text,image",
                    completionImagePrice: "0.01",
                },
                true,
            ),
        ).toEqual({
            name: "image-provider",
            title: "Image Provider",
            baseUrl: "https://example.com/v1",
            bearerToken: "upstream-token",
            modality: "image",
            imagePricing: "request",
            inputModalities: ["text", "image"],
            completionImagePrice: 0.01,
        });
    });

    it("keeps modality out of updates while allowing image pricing changes", () => {
        expect(
            modelBody(
                {
                    imagePricing: "tokens",
                    promptImagePrice: "0.000001",
                },
                false,
            ),
        ).toEqual({
            imagePricing: "tokens",
            promptImagePrice: 0.000001,
        });
    });
});
