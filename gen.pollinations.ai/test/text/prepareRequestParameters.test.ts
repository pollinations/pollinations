import type { ModelDefinition } from "@shared/registry/registry.ts";
import { describe, expect, it } from "vitest";
import { prepareRequestParameters } from "../../src/text/handler.js";
import type { RequestData } from "../../src/text/types.js";

const textModel = { outputModalities: ["text"] } as ModelDefinition;
const audioModel = { outputModalities: ["text", "audio"] } as ModelDefinition;

describe("prepareRequestParameters", () => {
    it("drops the voice query param for non-audio models", () => {
        const result = prepareRequestParameters(
            {
                model: "openai/gpt-5.4-nano",
                messages: [{ role: "user", content: "hi" }],
                voice: "banana",
            } as RequestData,
            textModel,
        );
        expect(result).not.toHaveProperty("voice");
        expect(result.messages).toEqual([{ role: "user", content: "hi" }]);
    });

    it("folds voice into audio.voice for audio models without duplication", () => {
        const result = prepareRequestParameters(
            {
                model: "openai/gpt-audio-1.5",
                messages: [{ role: "user", content: "hi" }],
                voice: "nova",
            } as RequestData,
            audioModel,
        );
        expect(result).not.toHaveProperty("voice");
        expect(result.audio).toEqual({ voice: "nova", format: "mp3" });
        expect(result.modalities).toEqual(["text", "audio"]);
    });

    it("defaults the folded voice to alloy and honors audio.voice", () => {
        const defaulted = prepareRequestParameters(
            {
                model: "openai/gpt-audio-1.5",
                messages: [{ role: "user", content: "hi" }],
            } as RequestData,
            audioModel,
        );
        expect(defaulted.audio).toEqual({ voice: "alloy", format: "mp3" });

        const explicit = prepareRequestParameters(
            {
                model: "openai/gpt-audio-1.5",
                messages: [{ role: "user", content: "hi" }],
                audio: { voice: "echo", format: "wav" },
            } as unknown as RequestData,
            audioModel,
        );
        // A client-provided audio object keeps its own voice and format.
        expect(explicit.audio).toEqual({ voice: "echo", format: "wav" });
        expect(explicit).not.toHaveProperty("voice");
    });

    it("uses pcm16 for streaming audio output", () => {
        const result = prepareRequestParameters(
            {
                model: "openai/gpt-audio-1.5",
                messages: [{ role: "user", content: "hi" }],
                voice: "nova",
                stream: true,
            } as RequestData,
            audioModel,
        );
        expect(result.audio).toEqual({ voice: "nova", format: "pcm16" });
    });
});
