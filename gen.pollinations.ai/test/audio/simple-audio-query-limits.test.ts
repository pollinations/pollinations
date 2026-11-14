import { describe, expect, it } from "vitest";
import { simpleAudioQuerySchema } from "../../src/routes/generation-handlers.ts";

describe("simpleAudioQuerySchema", () => {
    it("caps negative_prompt at the same 10000 characters as speech", () => {
        const parsed = simpleAudioQuerySchema.safeParse({
            negative_prompt: "a".repeat(10000),
        });
        expect(parsed.success).toBe(true);
    });

    it("rejects a negative_prompt over 10000 characters", () => {
        const parsed = simpleAudioQuerySchema.safeParse({
            negative_prompt: "a".repeat(10001),
        });
        expect(parsed.success).toBe(false);
        if (!parsed.success) {
            expect(parsed.error.issues[0]?.path).toEqual(["negative_prompt"]);
        }
    });
});
