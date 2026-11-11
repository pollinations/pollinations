import { DEFAULT_3D_MODEL } from "@shared/registry/model3d.ts";
import { describe, expect, it } from "vitest";
import { Model3dParamsSchema } from "@/model3d/params.ts";
import { Generate3dRequestQueryParamsSchema } from "@/schemas/model3d.ts";

describe.each([
    ["3d query", Generate3dRequestQueryParamsSchema],
    ["3d runtime", Model3dParamsSchema],
] as const)("%s image param", (_name, schema) => {
    const parseImage = (image: string) =>
        schema.parse({ model: DEFAULT_3D_MODEL, image }).image;

    it("keeps commas inside a single reference URL", () => {
        const url =
            "https://res.cloudinary.com/demo/image/upload/w_512,h_512/sample.jpg";
        expect(parseImage(url)).toEqual([url]);
    });

    it("still splits comma- and pipe-separated URLs", () => {
        expect(
            parseImage("https://a.example/1.png, https://b.example/w_1,h_2.png"),
        ).toEqual(["https://a.example/1.png", "https://b.example/w_1,h_2.png"]);
        expect(
            parseImage("https://a.example/1,2.png|https://b.example/2.png"),
        ).toEqual(["https://a.example/1,2.png", "https://b.example/2.png"]);
    });
});
