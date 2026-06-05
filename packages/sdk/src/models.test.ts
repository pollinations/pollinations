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
            // Deliberately unsorted: forces sortModels to reorder by category,
            // and "tts" before "speech-from-chat" exercises the id tiebreak.
            return Promise.resolve(
                jsonResponse([
                    {
                        name: "realtime-voice",
                        category: "realtime",
                        input_modalities: ["text", "audio", "image"],
                        output_modalities: ["text", "audio"],
                    },
                    {
                        name: "tts",
                        category: "audio",
                        input_modalities: ["text"],
                        output_modalities: ["audio"],
                    },
                    {
                        name: "movie",
                        category: "video",
                        input_modalities: ["text"],
                        output_modalities: ["image"],
                    },
                    {
                        name: "embedding-small",
                        category: "embedding",
                        input_modalities: ["text"],
                        output_modalities: ["embedding"],
                    },
                    {
                        name: "still",
                        aliases: ["stable"],
                        category: "image",
                        pricing: {
                            currency: "pollen",
                            completionImageTokens: "0.04",
                        },
                        context_length: 128000,
                        input_modalities: ["text"],
                        output_modalities: ["image"],
                        paid_only: true,
                    },
                    {
                        name: "speech-from-chat",
                        category: "audio",
                        input_modalities: ["text"],
                        output_modalities: ["text"],
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
    it("normalizes and sorts the public catalog; no key means no allowed set", async () => {
        const catalog = await fetchModelCatalog({
            baseUrl: "https://example.test",
        });

        // No apiKey: exactly one (anonymous) request, and an empty allow-set.
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
            "https://example.test/models",
            expect.any(Object),
        );
        expect([...catalog.allowedModelIds]).toEqual([]);

        // Category drives classification; output is sorted by category then id.
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
            category: "image",
            aliases: ["stable"],
            inputModalities: ["text"],
            outputModalities: ["image"],
            voices: [],
            paidOnly: true,
            tools: false,
            reasoning: false,
            contextLength: 128000,
            pricing: {
                currency: "pollen",
                completionImageTokens: "0.04",
            },
        });
        // Curated catalog item — raw ModelInfo wire fields don't leak through.
        expect(stillModel).not.toHaveProperty("input_modalities");
        expect(stillModel).not.toHaveProperty("output_modalities");
        expect(stillModel).not.toHaveProperty("paid_only");
        expect(stillModel).not.toHaveProperty("context_length");
        expect(stillModel).not.toHaveProperty("maxInputChars");
        expect(stillModel).not.toHaveProperty("source");
    });

    it("drops models with a missing or unknown category", async () => {
        fetchMock.mockImplementation((url: string) => {
            if (url.endsWith("/models")) {
                return Promise.resolve(
                    jsonResponse([
                        { name: "no-category", output_modalities: ["video"] },
                        { name: "bad-category", category: "hologram" },
                        { name: "good", category: "text" },
                    ]),
                );
            }
            return Promise.reject(new Error(`Unexpected URL: ${url}`));
        });

        const catalog = await fetchModelCatalog({
            baseUrl: "https://example.test",
        });

        expect(catalog.models.map((model) => model.id)).toEqual(["good"]);
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
            expect.objectContaining({ headers: {} }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            "https://example.test/models",
            expect.objectContaining({
                headers: { Authorization: "Bearer test-key" },
            }),
        );
        expect(catalog.models.map((model) => model.id)).toEqual(["free-text"]);
        expect([...catalog.allowedModelIds]).toEqual(["paid-image"]);
    });

    it("throws a PollinationsError when the catalog endpoint fails", async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 503 } as Response);

        await expect(
            fetchModelCatalog({ baseUrl: "https://example.test" }),
        ).rejects.toMatchObject({
            name: "PollinationsError",
            code: "MODEL_CATALOG",
            status: 503,
        });
    });
});
