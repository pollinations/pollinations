import { describe, it, expect } from "vitest";
import {
    ImageGenOptionsSchema,
    AudioGenOptionsSchema,
    VideoGenOptionsSchema,
    TextGenOptionsSchema,
    TranscribeOptionsSchema,
    validate,
    validateSafe,
} from "../../lib/validation.js";

describe("validation", () => {
    describe("ImageGenOptionsSchema", () => {
        it("should validate valid image options", () => {
            const data = {
                model: "flux",
                width: 1024,
                height: 768,
                seed: 42,
                safe: true,
                transparent: false,
                image: ["https://example.com/image.jpg"],
                output: "out.png",
            };
            const result = validateSafe(ImageGenOptionsSchema, data);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.model).toBe("flux");
            }
        });

        it("should reject invalid width", () => {
            const data = { width: 5000 };
            const result = validateSafe(ImageGenOptionsSchema, data);
            expect(result.success).toBe(false);
        });

        it("should reject invalid image URL", () => {
            const data = { image: ["not-a-url"] };
            const result = validateSafe(ImageGenOptionsSchema, data);
            expect(result.success).toBe(false);
        });
    });

    describe("AudioGenOptionsSchema", () => {
        it("should validate valid audio options", () => {
            const data = {
                voice: "nova",
                format: "mp3",
                model: "elevenmusic",
                speed: 1.5,
                duration: 30,
                instrumental: true,
                seed: 123,
                output: "speech.mp3",
                play: true,
            };
            const result = validateSafe(AudioGenOptionsSchema, data);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.voice).toBe("nova");
                expect(result.data.format).toBe("mp3");
            }
        });

        it("should reject invalid format", () => {
            const data = { format: "wma" };
            const result = validateSafe(AudioGenOptionsSchema, data);
            expect(result.success).toBe(false);
        });

        it("should reject invalid speed", () => {
            const data = { speed: 10 };
            const result = validateSafe(AudioGenOptionsSchema, data);
            expect(result.success).toBe(false);
        });
    });

    describe("VideoGenOptionsSchema", () => {
        it("should validate valid video options", () => {
            const data = {
                model: "wan-fast",
                width: 1280,
                height: 720,
                duration: 5,
                aspectRatio: "16:9",
                audio: true,
                seed: 456,
                image: "https://example.com/frame.jpg",
                output: "video.mp4",
            };
            const result = validateSafe(VideoGenOptionsSchema, data);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.aspectRatio).toBe("16:9");
            }
        });

        it("should reject invalid aspect ratio", () => {
            const data = { aspectRatio: "4:3" };
            const result = validateSafe(VideoGenOptionsSchema, data);
            expect(result.success).toBe(false);
        });
    });

    describe("TextGenOptionsSchema", () => {
        it("should validate valid text options", () => {
            const data = {
                model: "openai",
                system: "Be concise",
                temperature: 0.7,
                maxTokens: 100,
                topP: 0.9,
                frequencyPenalty: 0.5,
                presencePenalty: 0.2,
                seed: 789,
                jsonResponse: true,
                reasoning: "medium",
                image: ["https://example.com/img.jpg"],
                output: "out.txt",
                stream: false,
            };
            const result = validateSafe(TextGenOptionsSchema, data);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.reasoning).toBe("medium");
            }
        });

        it("should reject invalid temperature", () => {
            const data = { temperature: 3 };
            const result = validateSafe(TextGenOptionsSchema, data);
            expect(result.success).toBe(false);
        });

        it("should reject invalid reasoning effort", () => {
            const data = { reasoning: "extreme" };
            const result = validateSafe(TextGenOptionsSchema, data);
            expect(result.success).toBe(false);
        });
    });

    describe("TranscribeOptionsSchema", () => {
        it("should validate valid transcribe options", () => {
            const data = {
                model: "whisper",
                language: "en",
            };
            const result = validateSafe(TranscribeOptionsSchema, data);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.language).toBe("en");
            }
        });

        it("should reject invalid language code", () => {
            const data = { language: "eng" };
            const result = validateSafe(TranscribeOptionsSchema, data);
            expect(result.success).toBe(false);
        });

        it("should reject invalid model", () => {
            const data = { model: "invalid" };
            const result = validateSafe(TranscribeOptionsSchema, data);
            expect(result.success).toBe(false);
        });
    });
});