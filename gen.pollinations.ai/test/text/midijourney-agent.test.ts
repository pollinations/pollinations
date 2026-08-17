import { describe, expect, it } from "vitest";
import { findModelByName } from "../../src/text/availableModels.js";
import { resolveModelConfig } from "../../src/text/utils/modelResolver.js";

describe("MIDIjourney agent", () => {
    it("routes only the canonical ID to the Sol-backed prompt agent", () => {
        const canonical = findModelByName("midijourney");

        expect(findModelByName("midijourney-large")).toBeNull();
        expect(canonical?.useResponsesApi).toBe(true);
        expect(
            resolveModelConfig([{ role: "user", content: "Write a melody" }], {
                model: "midijourney",
            }).options.model,
        ).toBe("gpt-5.6-sol");
        expect(() =>
            resolveModelConfig([{ role: "user", content: "Write a melody" }], {
                model: "midijourney-large",
            }),
        ).toThrow("Model configuration not found for: midijourney-large");
    });

    it("prepends the MIDIjourney instructions once", async () => {
        const transform = findModelByName("midijourney")?.transform;
        const result = await transform?.(
            [
                { role: "system", content: "Use 7/8." },
                { role: "user", content: "Write a melody" },
            ],
            { model: "midijourney" },
        );

        expect(result?.messages).toHaveLength(2);
        expect(result?.messages[0]).toMatchObject({ role: "system" });
        expect(String(result?.messages[0]?.content)).toContain(
            "You are an expert musical transformer and generator.",
        );
        expect(String(result?.messages[0]?.content)).toContain(
            "Return exactly one valid YAML document",
        );
        expect(String(result?.messages[0]?.content)).toContain(
            "Additional caller instructions:\nUse 7/8.",
        );
        expect(String(result?.messages[0]?.content)).toContain("Use 7/8.");
        expect(result?.messages[1]).toEqual({
            role: "user",
            content: "Write a melody",
        });
    });
});
