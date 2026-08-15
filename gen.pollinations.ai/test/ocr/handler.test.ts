import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModelDefinition } from "../../../shared/registry/registry.ts";
import { generateOcr } from "../../src/ocr/handler.ts";
import type { CreateOcrRequest } from "../../src/schemas/ocr.ts";

const mistralServiceDef = {
    provider: "mistral",
} as ModelDefinition;

const OCR_REQUEST: CreateOcrRequest = {
    model: "mistral-ocr",
    document: {
        type: "document_url",
        document_url: "https://example.com/invoice.pdf",
    },
    include_image_base64: false,
};

const OCR_RESPONSE = {
    model: "mistral-ocr-latest",
    pages: [
        {
            index: 0,
            markdown: "Invoice #42\nTotal: $1,000",
            images: [],
            dimensions: { width: 100, height: 200 },
        },
    ],
    usage_info: { pages_processed: 1, doc_size_bytes: 12345 },
};

afterEach(() => {
    vi.restoreAllMocks();
});

describe("generateOcr", () => {
    it("forwards a Mistral-shaped request and returns the structured response", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        fetchSpy.mockResolvedValueOnce(
            new Response(JSON.stringify(OCR_RESPONSE), { status: 200 }),
        );

        const response = await generateOcr(
            { MISTRAL_API_KEY: "test-key" } as CloudflareBindings,
            OCR_REQUEST,
            mistralServiceDef,
            "mistral-ocr",
        );

        const [url, init] = fetchSpy.mock.calls[0];
        expect(url).toBe("https://api.mistral.ai/v1/ocr");
        expect((init as RequestInit).headers).toMatchObject({
            Authorization: "Bearer test-key",
        });
        expect(JSON.parse((init as RequestInit).body as string)).toEqual({
            model: "mistral-ocr-latest",
            document: OCR_REQUEST.document,
            include_image_base64: false,
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(OCR_RESPONSE);
        expect(response.headers.get("x-model-used")).toBe("mistral-ocr");
        expect(response.headers.get("x-usage-prompt-image-tokens")).toBe("1");
        expect(response.headers.get("x-usage-completion-text-tokens")).toBe(
            "7",
        );
    });

    it("billable usage defaults pages from the response when usage_info is absent", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        fetchSpy.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    model: "mistral-ocr-latest",
                    pages: [
                        { index: 0, markdown: "a", images: [] },
                        { index: 1, markdown: "b", images: [] },
                    ],
                }),
                { status: 200 },
            ),
        );

        const response = await generateOcr(
            { MISTRAL_API_KEY: "test-key" } as CloudflareBindings,
            OCR_REQUEST,
            mistralServiceDef,
            "mistral-ocr",
        );

        expect(response.headers.get("x-usage-prompt-image-tokens")).toBe("2");
        expect(response.headers.get("x-usage-completion-text-tokens")).toBe(
            "1",
        );
    });

    it("throws a clear error when the provider is not configured", async () => {
        await expect(
            generateOcr(
                {} as CloudflareBindings,
                OCR_REQUEST,
                { provider: "paddle" } as ModelDefinition,
                "paddle-ocr",
            ),
        ).rejects.toThrow("paddle");
    });

    it("surfaces upstream failures as errors", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        fetchSpy.mockResolvedValueOnce(new Response("boom", { status: 502 }));

        await expect(
            generateOcr(
                { MISTRAL_API_KEY: "test-key" } as CloudflareBindings,
                OCR_REQUEST,
                mistralServiceDef,
                "mistral-ocr",
            ),
        ).rejects.toThrow("boom");
    });
});
