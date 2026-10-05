import { afterEach, describe, expect, it, vi } from "vitest";
import { calculatePrice } from "../../../shared/registry/registry.ts";
import { generateOcr } from "../../src/ocr/handler.ts";
import type { CreateOcrRequest } from "../../src/schemas/ocr.ts";

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

    it("bills the page count the provider reported in usage_info", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        fetchSpy.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    ...OCR_RESPONSE,
                    usage_info: { pages_processed: 3 },
                }),
                { status: 200 },
            ),
        );

        const response = await generateOcr(
            { MISTRAL_API_KEY: "test-key" } as CloudflareBindings,
            OCR_REQUEST,
            "mistral-ocr",
        );

        expect(response.headers.get("x-usage-prompt-image-tokens")).toBe("3");
        // Mistral's list price is $4 / 1000 pages, so 3 pages cost $0.012.
        expect(
            calculatePrice("mistral-ocr", { promptImageTokens: 3 }).totalPrice,
        ).toBeCloseTo(0.012, 10);
    });

    it("falls back to the page count in the response when usage_info is absent", async () => {
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
            "mistral-ocr",
        );

        expect(response.headers.get("x-usage-prompt-image-tokens")).toBe("2");
        expect(response.headers.get("x-usage-completion-text-tokens")).toBe(
            "1",
        );
    });

    it("throws a clear error when the Mistral key is not configured", async () => {
        await expect(
            generateOcr({} as CloudflareBindings, OCR_REQUEST, "mistral-ocr"),
        ).rejects.toThrow("MISTRAL_API_KEY");
    });

    it("surfaces upstream failures as errors", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        fetchSpy.mockResolvedValueOnce(new Response("boom", { status: 502 }));

        await expect(
            generateOcr(
                { MISTRAL_API_KEY: "test-key" } as CloudflareBindings,
                OCR_REQUEST,
                "mistral-ocr",
            ),
        ).rejects.toThrow("boom");
    });
});
