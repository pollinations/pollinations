import { describe, expect, it } from "vitest";
import { resolveParams } from "../../src/routes/images.ts";

describe("resolveParams", () => {
    it("emits no width/height when size is omitted", () => {
        const result = resolveParams({});
        expect(result.width).toBeUndefined();
        expect(result.height).toBeUndefined();
    });

    it("emits width and height from an explicit portrait size", () => {
        const result = resolveParams({ size: "512x1024" });
        expect(result.width).toBe(512);
        expect(result.height).toBe(1024);
    });

    it("emits width and height from an explicit landscape size", () => {
        const result = resolveParams({ size: "1024x512" });
        expect(result.width).toBe(1024);
        expect(result.height).toBe(512);
    });

    it("maps OpenAI quality strings to internal values", () => {
        expect(resolveParams({ quality: "standard" }).quality).toBe("medium");
        expect(resolveParams({ quality: "hd" }).quality).toBe("high");
    });

    it("passes through internal quality values unchanged", () => {
        expect(resolveParams({ quality: "low" }).quality).toBe("low");
        expect(resolveParams({ quality: "high" }).quality).toBe("high");
    });
});
