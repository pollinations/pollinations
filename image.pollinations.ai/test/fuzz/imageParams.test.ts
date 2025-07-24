import { fc, it } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { makeParamsSafe } from "../../src/makeParamsSafe";
import { ImageParamsSchema } from "../../src/params";

const paramArbitrary = fc.oneof(
    fc.string(),
    fc.integer(),
    fc.float(),
    fc.boolean(),
);

const imageParamsArbitrary = fc.record({
    width: paramArbitrary,
    height: paramArbitrary,
    seed: paramArbitrary,
    model: paramArbitrary,
    enhance: paramArbitrary,
    nologo: paramArbitrary,
    negative_prompt: paramArbitrary,
    nofeed: paramArbitrary,
    safe: paramArbitrary,
    private: paramArbitrary,
    quality: paramArbitrary,
    image: paramArbitrary,
    transparent: paramArbitrary,
});

describe("ImageParamsSchema", () => {
    it.prop([imageParamsArbitrary])(
        "should produce the same results as makeParamsSafe",
        (params) => {
            const safeParams = makeParamsSafe(params);
            const parsedParams = ImageParamsSchema.safeParse(params);
            expect(parsedParams.error).toBeUndefined();
            expect(parsedParams.data).toEqual(safeParams);
        },
    );
});
