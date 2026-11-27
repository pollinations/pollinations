import { describe, expect, it } from "vitest";
import { CreateSpeechRequestSchema } from "../../src/routes/audio.ts";
import { SENTINEL_SEED } from "../../src/util.ts";

const speech = (seed?: number) =>
    CreateSpeechRequestSchema.parse({ input: "hi", seed }).seed;

describe("speech seed", () => {
    it("maps -1 to the compatibility seed, like GET /audio", () => {
        expect(speech(-1)).toBe(SENTINEL_SEED);
    });

    it("passes other seeds through", () => {
        expect(speech(0)).toBe(0);
        expect(speech(12345)).toBe(12345);
        expect(speech()).toBeUndefined();
    });
});
