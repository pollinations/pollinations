import { describe, expect, it } from "vitest";
import { CreateSpeechRequestSchema } from "../../src/routes/audio.ts";

describe("CreateSpeechRequestSchema voice", () => {
    it("rejects an explicit empty voice string", () => {
        const result = CreateSpeechRequestSchema.safeParse({
            model: "elevenlabs/eleven-v3",
            input: "hello",
            voice: "",
        });

        expect(result.success).toBe(false);
    });

    it("defaults an omitted voice to alloy", () => {
        const result = CreateSpeechRequestSchema.safeParse({
            model: "elevenlabs/eleven-v3",
            input: "hello",
        });

        expect(result.success).toBe(true);
        if (result.success) expect(result.data.voice).toBe("alloy");
    });

    it("accepts a custom voice ID", () => {
        const result = CreateSpeechRequestSchema.safeParse({
            model: "elevenlabs/eleven-v3",
            input: "hello",
            voice: "21m00Tcm4TlvDq8ikWAM",
        });

        expect(result.success).toBe(true);
    });
});
