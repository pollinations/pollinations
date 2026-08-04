import { parseModelCatalogResponse } from "@frontend/components/models/model-catalog.ts";
import { describe, expect, it } from "vitest";

describe("parseModelCatalogResponse", () => {
    it("returns the array when entries have identifiable models", () => {
        const data = [
            { name: "openai/gpt-5.4-nano" },
            { id: "black-forest-labs/FLUX.1-schnell" },
        ];

        expect(parseModelCatalogResponse(data)).toEqual(data);
    });

    it("throws on a non-array response", () => {
        expect(() => parseModelCatalogResponse({ models: [] })).toThrow();
        expect(() => parseModelCatalogResponse(null)).toThrow();
    });

    it("throws on an empty array", () => {
        expect(() => parseModelCatalogResponse([])).toThrow();
    });

    it("throws when every entry lacks a name and id", () => {
        expect(() =>
            parseModelCatalogResponse([{ title: "Mystery" }, {}]),
        ).toThrow();
    });
});
