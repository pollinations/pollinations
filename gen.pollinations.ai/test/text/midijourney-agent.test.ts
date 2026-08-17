import { env } from "cloudflare:test";
import { modelInfoFromDefinition } from "@shared/registry/model-info.ts";
import { describe, expect, it } from "vitest";
import { getGenerationModelRegistry } from "../../src/model-registry.js";
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

    it("inherits public capabilities from the Sol base model", async () => {
        const registry = await getGenerationModelRegistry(env);
        const agent = registry.resolve("midijourney");
        const base = registry.resolve("gpt-5.6-sol");

        expect(agent?.info).toMatchObject({
            title: "MIDI Journey",
            brand: "Pollinations",
            agent: true,
            base_model: "gpt-5.6-sol",
            input_modalities: base?.info.input_modalities,
            output_modalities: base?.info.output_modalities,
            capabilities: base?.info.capabilities,
            tools: base?.info.tools,
            reasoning: base?.info.reasoning,
            context_length: base?.info.context_length,
            max_reference_images: base?.info.max_reference_images,
        });
        expect(agent?.info.input_modalities).toContain("image");
        if (!agent) throw new Error("MIDI Journey agent is missing");
        expect(agent.info.pricing).toEqual(
            modelInfoFromDefinition(agent.id, agent.definition).pricing,
        );
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

    it("preserves multimodal caller messages", async () => {
        const transform = findModelByName("midijourney")?.transform;
        const content = [
            { type: "text", text: "Turn this score into a bass line" },
            {
                type: "image_url",
                image_url: { url: "https://example.com/score.png" },
            },
        ];
        const result = await transform?.([{ role: "user", content }], {
            model: "midijourney",
        });

        expect(result?.messages[1]).toEqual({ role: "user", content });
    });
});
