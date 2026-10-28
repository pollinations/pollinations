import { describe, expect, it } from "vitest";
import { CreateSpeechRequestSchema } from "@/routes/audio.ts";

describe("CreateSpeechRequestSchema speed validation", () => {
    it("accepts speed within 0.25-4", () => {
        const result = CreateSpeechRequestSchema.safeParse({ speed: 1.25 });
        expect(result.success).toBe(true);
    });

    it("rejects speed below 0.25", () => {
        const result = CreateSpeechRequestSchema.safeParse({ speed: 0.1 });
        expect(result.success).toBe(false);
    });

    it("rejects speed above 4", () => {
        const result = CreateSpeechRequestSchema.safeParse({ speed: 5 });
        expect(result.success).toBe(false);
    });
});
