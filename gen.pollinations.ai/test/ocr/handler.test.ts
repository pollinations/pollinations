import { afterEach, describe, expect, it, vi } from "vitest";
import { calculatePrice } from "../../../shared/registry/registry.ts";
import { generateOcr } from "../../src/ocr/handler.ts";
import type { CreateOcrRequest } from "../../src/schemas/ocr.ts";

const OCR_REQUEST: CreateOcrRequest = {
    model: "mistralai/mistral-ocr-4.1",
    document: {
        type: "document_url",
        document_url: "https://example.com/invoice.pdf",
    },
    include_image_base64: false,
};

const OCR_RESPONSE = {
    model: "mistral-ocr-4-1",
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
            "mistralai/mistral-ocr-4.1",
        );

        const [url, init] = fetchSpy.mock.calls[0];
        expect(url).toBe("https://api.mistral.ai/v1/ocr");
        expect((init as RequestInit).headers).toMatchObject({
            Authorization: "Bearer test-key",
        });
        expect(JSON.parse((init as RequestInit).body as string)).toEqual({
            model: "mistral-ocr-4-1",
            document: OCR_REQUEST.document,
            include_image_base64: false,
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(OCR_RESPONSE);
        expect(response.headers.get("x-model-used")).toBe(
            "mistralai/mistral-ocr-4.1",
        );
        expect(response.headers.get("x-usage-prompt-image-tokens")).toBe("1");
        expect(
            response.headers.get("x-usage-completion-text-tokens"),
        ).toBeNull();
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
            "mistralai/mistral-ocr-4.1",
        );

        expect(response.headers.get("x-usage-prompt-image-tokens")).toBe("3");
        // Mistral's list price is $4 / 1000 pages, so 3 pages cost $0.012.
        expect(
            calculatePrice("mistralai/mistral-ocr-4.1", {
                promptImageTokens: 3,
            }).totalPrice,
        ).toBeCloseTo(0.012, 10);
    });

    it("fails with a 502 instead of guessing when usage_info.pages_processed is missing", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        fetchSpy.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    model: "mistral-ocr-4-1",
                    pages: [
                        { index: 0, markdown: "a", images: [] },
                        { index: 1, markdown: "b", images: [] },
                    ],
                }),
                { status: 200 },
            ),
        );

        const error = await generateOcr(
            { MISTRAL_API_KEY: "test-key" } as CloudflareBindings,
            OCR_REQUEST,
            "mistralai/mistral-ocr-4.1",
        ).catch((caught: unknown) => caught);

        expect(error).toMatchObject({ status: 502 });
        expect((error as Error).message).toContain("pages_processed");
    });

    it("rejects requested pages the document does not have with a 400", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        fetchSpy.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    model: "mistral-ocr-4-1",
                    pages: [],
                    usage_info: { pages_processed: 0, doc_size_bytes: 97663 },
                }),
                { status: 200 },
            ),
        );

        const error = await generateOcr(
            { MISTRAL_API_KEY: "test-key" } as CloudflareBindings,
            { ...OCR_REQUEST, pages: [50] },
            "mistralai/mistral-ocr-4.1",
        ).catch((caught: unknown) => caught);

        expect(error).toMatchObject({ status: 400 });
        expect((error as Error).message).toContain("pages");
    });

    it("throws a clear error when the Mistral key is not configured", async () => {
        await expect(
            generateOcr(
                {} as CloudflareBindings,
                OCR_REQUEST,
                "mistralai/mistral-ocr-4.1",
            ),
        ).rejects.toThrow("MISTRAL_API_KEY");
    });

    it("surfaces upstream failures as errors", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        fetchSpy.mockResolvedValueOnce(new Response("boom", { status: 502 }));

        await expect(
            generateOcr(
                { MISTRAL_API_KEY: "test-key" } as CloudflareBindings,
                OCR_REQUEST,
                "mistralai/mistral-ocr-4.1",
            ),
        ).rejects.toThrow("boom");
    });
});
