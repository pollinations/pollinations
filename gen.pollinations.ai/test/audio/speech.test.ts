import { describe, expect, it } from "vitest";
import { CreateSpeechRequestSchema } from "../../src/routes/audio.ts";

describe("CreateSpeechRequestSchema speed", () => {
    it.each([0.25, 1, 2, 4])("accepts speed %f", (speed) => {
        expect(
            CreateSpeechRequestSchema.safeParse({
                input: "hello",
                speed,
            }).success,
        ).toBe(true);
    });

    it.each([0, 0.24, 4.01, 100, -1])("rejects speed %f", (speed) => {
        expect(
            CreateSpeechRequestSchema.safeParse({
                input: "hello",
                speed,
            }).success,
        ).toBe(false);
    });

    it("omits speed when not provided", () => {
        expect(
            CreateSpeechRequestSchema.parse({ input: "hello" }).speed,
        ).toBeUndefined();
    });
});
