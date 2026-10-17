import { describe, expect, it } from "vitest";
import {
    GenerateImageRequestQueryParamsSchema,
    GenerateVideoRequestQueryParamsSchema,
} from "@/schemas/image.ts";

// The public query schemas bound `duration` at 1-120 and the registry declares
// each model's ceiling; see gen.pollinations.ai/src/schemas/image.ts.
describe("public duration validation", () => {
    it("accepts the full mirelo/sfx-2.0 range up to 120s", () => {
        for (const duration of [1, 60, 120]) {
            expect(
                GenerateVideoRequestQueryParamsSchema.safeParse({
                    model: "mirelo/sfx-2.0",
                    duration,
                }).success,
                String(duration),
            ).toBe(true);
        }
    });

    it("rejects durations above the schema's 1-120 bound", () => {
        for (const duration of [0, 1.5, 121, 1e308]) {
            expect(
                GenerateVideoRequestQueryParamsSchema.safeParse({
                    model: "mirelo/sfx-2.0",
                    duration,
                }).success,
                String(duration),
            ).toBe(false);
        }
    });

    it("rejects durations above the selected model's registry ceiling", () => {
        const result = GenerateVideoRequestQueryParamsSchema.safeParse({
            model: "google/veo-3.1-fast",
            duration: 30,
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]?.message).toBe(
                "Duration above 8 seconds is not supported by google/veo-3.1-fast.",
            );
        }
    });

    it("resolves model aliases to their registry ceiling", () => {
        expect(
            GenerateVideoRequestQueryParamsSchema.safeParse({
                model: "veo",
                duration: 8,
            }).success,
        ).toBe(true);
        expect(
            GenerateVideoRequestQueryParamsSchema.safeParse({
                model: "veo",
                duration: 9,
            }).success,
        ).toBe(false);
    });

    it("leaves models without a declared ceiling to the schema bound", () => {
        // Image models ignore duration; community endpoints resolve later.
        expect(
            GenerateImageRequestQueryParamsSchema.safeParse({
                model: "black-forest-labs/flux.1-schnell",
                duration: 120,
            }).success,
        ).toBe(true);
    });
});
