import { describe, expect, it } from "vitest";
import { generateEmbeddings } from "../generateEmbeddings.ts";

describe("generateEmbeddings", () => {
    it("returns OpenAI-compatible response format for text input", async () => {
        if (!process.env.GOOGLE_PROJECT_ID) {
            console.log("Skipping: no Google credentials");
            return;
        }

        const response = await generateEmbeddings({
            model: "gemini-embedding-2-preview",
            input: "Hello world",
        });

        const body = await response.json();

        expect(body.object).toBe("list");
        expect(body.data).toHaveLength(1);
        expect(body.data[0].object).toBe("embedding");
        expect(body.data[0].embedding).toBeInstanceOf(Array);
        expect(body.data[0].embedding.length).toBeGreaterThan(0);
        expect(body.data[0].index).toBe(0);
        expect(body.model).toBe("gemini-embedding-2-preview");
        expect(body.usage.prompt_tokens).toBeGreaterThan(0);
    });

    it("supports custom dimensions", async () => {
        if (!process.env.GOOGLE_PROJECT_ID) return;

        const response = await generateEmbeddings({
            model: "gemini-embedding-2-preview",
            input: "Hello world",
            dimensions: 768,
        });

        const body = await response.json();
        expect(body.data[0].embedding).toHaveLength(768);
    });

    it("supports batch text input", async () => {
        if (!process.env.GOOGLE_PROJECT_ID) return;

        const response = await generateEmbeddings({
            model: "gemini-embedding-2-preview",
            input: ["Hello", "World"],
        });

        const body = await response.json();
        expect(body.data).toHaveLength(2);
        expect(body.data[0].index).toBe(0);
        expect(body.data[1].index).toBe(1);
    });

    it("supports image_url input", async () => {
        if (!process.env.GOOGLE_PROJECT_ID) {
            console.log("Skipping: no Google credentials");
            return;
        }

        const response = await generateEmbeddings({
            model: "gemini-embedding-2-preview",
            input: [
                { type: "text", text: "A photo of a cat" },
                {
                    type: "image_url",
                    image_url: {
                        url: "https://picsum.photos/200",
                    },
                },
            ],
        });

        const body = await response.json();

        expect(body.object).toBe("list");
        expect(body.data).toHaveLength(1);
        expect(body.data[0].embedding).toBeInstanceOf(Array);
        expect(body.data[0].embedding.length).toBeGreaterThan(0);
        expect(body.usage.prompt_tokens).toBeGreaterThan(0);
    });

    it("supports input_audio input", async () => {
        if (!process.env.GOOGLE_PROJECT_ID) {
            console.log("Skipping: no Google credentials");
            return;
        }

        // Minimal valid WAV (0.1s silence, mono, 8kHz, 16-bit PCM)
        const response = await generateEmbeddings({
            model: "gemini-embedding-2-preview",
            input: [
                { type: "text", text: "Audio description" },
                {
                    type: "input_audio",
                    input_audio: {
                        data: "UklGRmQGAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YUAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
                        format: "wav",
                    },
                },
            ],
        });

        const body = await response.json();

        expect(body.object).toBe("list");
        expect(body.data).toHaveLength(1);
        expect(body.data[0].embedding).toBeInstanceOf(Array);
        expect(body.data[0].embedding.length).toBeGreaterThan(0);
        expect(body.usage.prompt_tokens).toBeGreaterThan(0);
    });

    it("supports video_url input", async () => {
        if (!process.env.GOOGLE_PROJECT_ID) {
            console.log("Skipping: no Google credentials");
            return;
        }

        const response = await generateEmbeddings({
            model: "gemini-embedding-2-preview",
            input: [
                { type: "text", text: "A short video clip" },
                {
                    type: "video_url",
                    video_url: {
                        url: "https://www.w3schools.com/html/mov_bbb.mp4",
                    },
                },
            ],
        });

        const body = await response.json();

        expect(body.object).toBe("list");
        expect(body.data).toHaveLength(1);
        expect(body.data[0].embedding).toBeInstanceOf(Array);
        expect(body.data[0].embedding.length).toBeGreaterThan(0);
        expect(body.usage.prompt_tokens).toBeGreaterThan(0);
    });

    it("returns empty data for empty input array", async () => {
        const response = await generateEmbeddings({
            model: "gemini-embedding-2-preview",
            input: [] as string[],
        });

        const body = await response.json();
        expect(body.data).toHaveLength(0);
        expect(body.usage.prompt_tokens).toBe(0);
    });
});
