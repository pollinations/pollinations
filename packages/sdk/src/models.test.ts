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
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("fetchModelCatalog", () => {
    it("returns the public registry unchanged", async () => {
        const rawModels = [
            {
                name: "new-category",
                category: "hologram",
                new_server_field: { preserved: true },
            },
            {
                id: "provider/model",
                name: "model",
                title: "Model",
                category: "text",
                input_modalities: ["text"],
                paid_only: true,
            },
        ];
        const signal = new AbortController().signal;
        fetchMock.mockResolvedValue(jsonResponse(rawModels));

        const catalog = await fetchModelCatalog({
            baseUrl: "https://example.test///",
            signal,
        });

        expect(fetchMock).toHaveBeenCalledOnce();
        expect(fetchMock).toHaveBeenCalledWith("https://example.test/models", {
            headers: {},
            signal,
        });
        expect(catalog.models).toBe(rawModels);
        expect(catalog.models).toEqual(rawModels);
        expect([...catalog.allowedModelIds]).toEqual([]);
    });

    it("derives allowed IDs from a second authenticated registry response", async () => {
        const publicModels = [{ name: "public-model", category: "text" }];
        const allowedModels = [
            { id: "provider/allowed", name: "allowed" },
            { name: "allowed-by-name" },
        ];
        fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
            const headers = init?.headers as Record<string, string> | undefined;
            return Promise.resolve(
                jsonResponse(
                    headers?.Authorization ? allowedModels : publicModels,
                ),
            );
        });

        const catalog = await fetchModelCatalog({
            apiKey: "test-key",
            baseUrl: "https://example.test",
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
        expect(catalog.models).toBe(publicModels);
        expect([...catalog.allowedModelIds]).toEqual([
            "provider/allowed",
            "allowed-by-name",
        ]);
    });

    it("rejects a successful non-array registry response", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ error: "unexpected" }));

        await expect(
            fetchModelCatalog({ baseUrl: "https://example.test" }),
        ).rejects.toMatchObject({
            name: "PollinationsError",
            code: "MODEL_CATALOG",
            status: 502,
        });
    });

    it("preserves the upstream status when the registry request fails", async () => {
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
