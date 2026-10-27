import { describe, expect, it } from "vitest";
import { GenerateImageRequestQueryParamsSchema } from "@/schemas/image.ts";

const parseImage = (image: string) =>
    GenerateImageRequestQueryParamsSchema.parse({ image }).image;

describe("image query param", () => {
    it("keeps commas inside a single reference URL", () => {
        const url =
            "https://res.cloudinary.com/demo/image/upload/w_512,h_512/sample.jpg";
        const query = new URLSearchParams({ image: url });
        expect(parseImage(query.get("image") ?? "")).toEqual([url]);
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
