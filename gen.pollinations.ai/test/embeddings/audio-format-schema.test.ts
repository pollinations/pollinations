import { describe, expect, it } from "vitest";
import { CreateEmbeddingRequestSchema } from "../../src/schemas/embeddings.ts";

const audio = (format: string) => ({
    model: "google/gemini-embedding-2",
    input: [{ type: "input_audio", input_audio: { data: "AAAA", format } }],
});

describe("embedding audio format", () => {
    it.each([
        "mp3",
        "mpeg",
        "wav",
        "x-wav",
        "aiff",
        "aac",
        "ogg",
        "oga",
        "flac",
        "mp4",
        "m4a",
        "webm",
        "opus",
    ])("accepts the known audio container %s", (format) => {
        expect(
            CreateEmbeddingRequestSchema.safeParse(audio(format)).success,
        ).toBe(true);
    });

    it.each(["", " ", "bogus", "audio/mp3"])(
        "rejects the unknown audio container %s",
        (format) => {
            expect(
                CreateEmbeddingRequestSchema.safeParse(audio(format)).success,
            ).toBe(false);
        },
    );
});
