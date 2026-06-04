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
        if (url.endsWith("/models")) {
            return Promise.resolve(
                jsonResponse([
                    {
                        name: "still",
                        aliases: ["stable"],
                        category: "image",
                        pricing: {
                            currency: "pollen",
                            completionImageTokens: "0.04",
                        },
                        maxInputChars: 500,
                        context_length: 128000,
                        input_modalities: ["text"],
                        output_modalities: ["image"],
                        paid_only: true,
                    },
                    {
                        name: "movie",
                        category: "video",
                        input_modalities: ["text"],
                        output_modalities: ["image"],
                    },
                    {
                        name: "speech-from-chat",
                        category: "audio",
                        input_modalities: ["text"],
                        output_modalities: ["text"],
                    },
                    {
                        name: "tts",
                        category: "audio",
                        input_modalities: ["text"],
                        output_modalities: ["audio"],
                    },
                    {
                        name: "embedding-small",
                        category: "embedding",
                        input_modalities: ["text"],
                        output_modalities: ["embedding"],
                    },
                    {
                        name: "realtime-voice",
                        category: "realtime",
                        input_modalities: ["text", "audio", "image"],
                        output_modalities: ["text", "audio"],
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

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
            "https://example.test/models",
            expect.any(Object),
        );
        expect(
            catalog.models.map((model) => [model.id, model.category]),
        ).toEqual([
            ["still", "image"],
            ["movie", "video"],
            ["speech-from-chat", "audio"],
            ["tts", "audio"],
            ["embedding-small", "embedding"],
            ["realtime-voice", "realtime"],
        ]);

        const stillModel = catalog.models.find((model) => model.id === "still");
        expect(stillModel).toMatchObject({
            id: "still",
            name: "still",
            aliases: ["stable"],
            category: "image",
            pricing: {
                currency: "pollen",
                completionImageTokens: "0.04",
            },
            maxInputChars: 500,
            context_length: 128000,
            input_modalities: ["text"],
            output_modalities: ["image"],
            paid_only: true,
        });
        expect(stillModel).not.toHaveProperty("source");
        expect(stillModel).not.toHaveProperty("inputModalities");
        expect(stillModel).not.toHaveProperty("outputModalities");
        expect(stillModel).not.toHaveProperty("paidOnly");
    });

    it("keeps a modality fallback for older model endpoints without category", async () => {
        fetchMock.mockImplementation((url: string) => {
            if (url.endsWith("/models")) {
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
            return Promise.reject(new Error(`Unexpected URL: ${url}`));
        });

        const catalog = await fetchModelCatalog({
            baseUrl: "https://example.test",
        });

        expect(catalog.models[0]?.category).toBe("video");
    });

    it("fetches allowed models from the rich catalog endpoint only", async () => {
        fetchMock.mockImplementation((url: string, init?: RequestInit) => {
            if (url.endsWith("/models")) {
                const headers = init?.headers as
                    | Record<string, string>
                    | undefined;
                const isAuthenticated =
                    headers?.Authorization === "Bearer test-key";
                return Promise.resolve(
                    jsonResponse(
                        isAuthenticated
                            ? [
                                  {
                                      name: "paid-image",
                                      category: "image",
                                      input_modalities: ["text"],
                                      output_modalities: ["image"],
                                  },
                              ]
                            : [
                                  {
                                      name: "free-text",
                                      category: "text",
                                      input_modalities: ["text"],
                                      output_modalities: ["text"],
                                  },
                              ],
                    ),
                );
            }
            return Promise.reject(new Error(`Unexpected URL: ${url}`));
        });

        const catalog = await fetchModelCatalog({
            baseUrl: "https://example.test",
            apiKey: "test-key",
        });

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            "https://example.test/models",
            { headers: {}, signal: undefined },
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            "https://example.test/models",
            {
                headers: { Authorization: "Bearer test-key" },
                signal: undefined,
            },
        );
        expect(catalog.models.map((model) => model.id)).toEqual(["free-text"]);
        expect([...catalog.allowedModelIds]).toEqual(["paid-image"]);
    });
});
