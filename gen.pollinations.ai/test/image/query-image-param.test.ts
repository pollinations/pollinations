import { describe, expect, it } from "vitest";
import { ImageParamsSchema } from "@/image/params.ts";
import {
    GenerateImageRequestQueryParamsSchema,
    GenerateVideoRequestQueryParamsSchema,
} from "@/schemas/image.ts";

describe.each([
    ["image query", GenerateImageRequestQueryParamsSchema],
    ["video query", GenerateVideoRequestQueryParamsSchema],
    ["runtime", ImageParamsSchema],
] as const)("%s image param", (_name, schema) => {
    const parseImage = (image: string, model = "google/veo-3.1-fast") =>
        schema.parse({ model, image }).image;
    it("keeps commas inside a single reference URL", () => {
        const url =
            "https://res.cloudinary.com/demo/image/upload/w_512,h_512/sample.jpg";
        const query = new URLSearchParams({ image: url });
        expect(
            parseImage(
                query.get("image") ?? "",
                "black-forest-labs/flux.1-kontext-pro",
            ),
        ).toEqual([url]);
    });

    it("still splits comma- and pipe-separated URLs", () => {
        expect(
            parseImage("https://a.example/1.png,https://b.example/w_1,h_2.png"),
        ).toEqual(["https://a.example/1.png", "https://b.example/w_1,h_2.png"]);
        expect(
            parseImage("https://a.example/1,2.png|https://b.example/2.png"),
        ).toEqual(["https://a.example/1,2.png", "https://b.example/2.png"]);
    });
});
