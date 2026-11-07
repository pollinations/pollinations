import { describe, expect, it } from "vitest";
import { simpleAudioQuerySchema } from "../../src/routes/generation-handlers.ts";

describe("simpleAudioQuerySchema model", () => {
    it("rejects an explicit empty model string", () => {
        const result = simpleAudioQuerySchema.safeParse({ model: "" });

        expect(result.success).toBe(false);
    });

    it("accepts an omitted model", () => {
        const result = simpleAudioQuerySchema.safeParse({});

        expect(result.success).toBe(true);
    });

    it("accepts a concrete model", () => {
        const result = simpleAudioQuerySchema.safeParse({
            model: "elevenlabs/eleven-v3",
        });

        expect(result.success).toBe(true);
    });
});
