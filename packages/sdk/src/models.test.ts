import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchModelCatalog } from "./models.js";

function jsonResponse(body: unknown): Response {
    return {
        ok: true,
        status: 200,
        json: async () => body,
    } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
    fetchMock = vi.fn((url: string) => {
        if (url.endsWith("/image/models")) {
            return Promise.resolve(
                jsonResponse([
                    {
                        name: "still",
                        category: "image",
                        input_modalities: ["text"],
                        output_modalities: ["image"],
                    },
                    {
                        name: "movie",
                        category: "video",
                        input_modalities: ["text"],
                        output_modalities: ["image"],
                    },
                ]),
            );
        }
        if (url.endsWith("/text/models")) {
            return Promise.resolve(
                jsonResponse([
                    {
                        name: "speech-from-chat",
                        category: "audio",
                        input_modalities: ["text"],
                        output_modalities: ["text"],
                    },
                ]),
            );
        }
        if (url.endsWith("/audio/models")) {
            return Promise.resolve(
                jsonResponse([
                    {
                        name: "tts",
                        category: "audio",
                        input_modalities: ["text"],
                        output_modalities: ["audio"],
                    },
                ]),
            );
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("fetchModelCatalog", () => {
    it("uses endpoint category as the model category source of truth", async () => {
        const catalog = await fetchModelCatalog({
            baseUrl: "https://example.test",
        });

        expect(catalog.models.map((model) => [model.id, model.category])).toEqual([
            ["still", "image"],
            ["movie", "video"],
            ["speech-from-chat", "audio"],
            ["tts", "audio"],
        ]);
    });

    it("keeps a modality fallback for older model endpoints without category", async () => {
        fetchMock.mockImplementation((url: string) => {
            if (url.endsWith("/image/models")) {
                return Promise.resolve(
                    jsonResponse([
                        {
                            name: "legacy-video",
                            input_modalities: ["text"],
                            output_modalities: ["video"],
                        },
                    ]),
                );
            }
            return Promise.resolve(jsonResponse([]));
        });

        const catalog = await fetchModelCatalog({
            baseUrl: "https://example.test",
        });

        expect(catalog.models[0]?.category).toBe("video");
    });
});
