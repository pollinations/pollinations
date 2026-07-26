import {
    createExecutionContext,
    SELF,
    waitOnExecutionContext,
} from "cloudflare:test";
import { UpstreamError } from "@shared/error.ts";
import { countMistralOcrPages } from "@shared/registry/mistral-ocr-billing.ts";
import {
    calculateUsageBilling,
    getRegistryModelDefinition,
} from "@shared/registry/registry.ts";
import { test as fixtureTest } from "@shared/test/fixtures/index.ts";
import type { Context } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env.ts";
import worker from "@/index.ts";
import { resolveModelDefinition } from "@/middleware/model.ts";
import { resetGenerationModelRegistryCache } from "@/model-registry.ts";
import { handleMistralOcr } from "@/ocr/mistral.ts";
import { CreateOcrRequestSchema } from "@/schemas/ocr.ts";

const OCR_RESPONSE = {
    pages: [
        {
            index: 0,
            markdown: "# Invoice\n\nTotal: $12.00",
            images: [],
        },
    ],
    model: "mistral-ocr-4-0",
    document_annotation: null,
    usage_info: {
        pages_processed: 1,
        doc_size_bytes: 1234,
    },
};

function contextWithKey(): Context<Env> {
    return {
        env: { MISTRAL_API_KEY: "test-key" } as CloudflareBindings,
    } as Context<Env>;
}

function requestUrl(input: RequestInfo | URL): string {
    if (typeof input === "string") {
        return input;
    }
    return input instanceof URL ? input.href : input.url;
}

async function fetchWorker(path: string): Promise<Response> {
    const context = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://gen.pollinations.ai${path}`),
        {
            ENTER: {
                fetch: async () => new Response("enter"),
            } as unknown as Fetcher,
            ENVIRONMENT: "test",
        } as CloudflareBindings,
        context,
    );
    await waitOnExecutionContext(context);
    return response;
}

afterEach(() => {
    vi.restoreAllMocks();
    resetGenerationModelRegistryCache();
});

describe("Mistral OCR", () => {
    it("pins OCR 4, forwards supported controls, and attaches model usage", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValue(Response.json(OCR_RESPONSE));

        const response = await handleMistralOcr(contextWithKey(), {
            model: "mistral-ocr",
            document: {
                type: "image_url",
                image_url: "data:image/png;base64,AAAA",
            },
            include_blocks: true,
            confidence_scores_granularity: "word",
        });

        expect(response.status).toBe(200);
        expect(response.headers.get("x-model-used")).toBe("mistral-ocr-4-0");
        expect(await response.json()).toEqual(OCR_RESPONSE);

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("https://api.mistral.ai/v1/ocr");
        const request = JSON.parse(String(init?.body));
        expect(request).toMatchObject({
            model: "mistral-ocr-4-0",
            include_blocks: true,
            confidence_scores_granularity: "word",
        });
    });

    it("rejects a successful upstream response without billable pages", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({
                ...OCR_RESPONSE,
                usage_info: { pages_processed: 0 },
            }),
        );

        await expect(
            handleMistralOcr(contextWithKey(), {
                document: {
                    type: "document_url",
                    document_url: "https://example.com/document.pdf",
                },
            }),
        ).rejects.toMatchObject({
            status: 502,
        });
    });

    it("requires a configured provider key", async () => {
        const context = {
            env: {} as CloudflareBindings,
        } as Context<Env>;

        await expect(
            handleMistralOcr(context, {
                document: {
                    type: "document_url",
                    document_url: "https://example.com/document.pdf",
                },
            }),
        ).rejects.toBeInstanceOf(UpstreamError);
    });

    it("bills the exact provider-reported page count", () => {
        const definition = getRegistryModelDefinition("mistral-ocr");
        const billing = calculateUsageBilling("mistral-ocr", {}, definition, {
            ...OCR_RESPONSE,
            usage_info: { pages_processed: 3 },
        });

        expect(countMistralOcrPages(OCR_RESPONSE)).toBe(1);
        expect(billing.cost.totalCost).toBe(0.012);
        expect(billing.price.totalPrice).toBe(0.012);
        expect(billing.adjustments).toEqual([
            expect.objectContaining({
                ruleId: "mistral.ocr_4.page.v1",
                unit: "page",
                units: 3,
                unitCost: 0.004,
            }),
        ]);
    });

    it("rejects custom annotation requests until annotated-page billing is supported", () => {
        const parsed = CreateOcrRequestSchema.safeParse({
            model: "mistral-ocr",
            document: {
                type: "document_url",
                document_url: "https://example.com/document.pdf",
            },
            document_annotation_format: { type: "json_object" },
        });

        expect(parsed.success).toBe(false);
    });

    it("is available only on the OCR endpoint, not chat completions", async () => {
        const env = {} as CloudflareBindings;
        await expect(
            resolveModelDefinition(
                "mistral-ocr-4",
                "generate.text",
                env,
                undefined,
                "/v1/ocr",
            ),
        ).resolves.toMatchObject({
            resolved: "mistral-ocr",
        });

        await expect(
            resolveModelDefinition(
                "mistral-ocr",
                "generate.text",
                env,
                undefined,
                "/v1/chat/completions",
            ),
        ).rejects.toMatchObject({
            status: 400,
        });
    });

    it("advertises only the OCR endpoint with paid per-page metadata", async () => {
        const ocrModelsResponse = await fetchWorker("/ocr/models");
        const ocrModels = (await ocrModelsResponse.json()) as Array<{
            name: string;
            paid_only: boolean;
            supported_endpoints: string[];
            billing_adjustments: Array<{
                unit: string;
                unit_price: string;
            }>;
        }>;

        expect(ocrModelsResponse.status).toBe(200);
        expect(ocrModels).toEqual([
            expect.objectContaining({
                name: "mistral-ocr",
                paid_only: true,
                supported_endpoints: ["/v1/ocr"],
                billing_adjustments: [
                    expect.objectContaining({
                        unit: "page",
                        unit_price: "0.004",
                    }),
                ],
            }),
        ]);

        const textModelsResponse = await fetchWorker("/text/models");
        const textModels = (await textModelsResponse.json()) as Array<{
            name: string;
        }>;
        expect(textModels.some((model) => model.name === "mistral-ocr")).toBe(
            false,
        );

        const openAiModelsResponse = await fetchWorker("/v1/models");
        const openAiModels = (await openAiModelsResponse.json()) as {
            data: Array<{ id: string; supported_endpoints: string[] }>;
        };
        expect(
            openAiModels.data.find((model) => model.id === "mistral-ocr"),
        ).toMatchObject({
            supported_endpoints: ["/v1/ocr"],
        });
    });
});

fixtureTest(
    "runs the authenticated OCR route and enforces paid-only access",
    async ({ apiKey, paidApiKey }) => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(async (input) => {
                const url = requestUrl(input);
                if (url === "https://api.mistral.ai/v1/ocr") {
                    return Response.json(OCR_RESPONSE);
                }
                if (url.includes("public_model_stats.json")) {
                    return Response.json({
                        data: [
                            {
                                model: "mistral-ocr",
                                avg_cost_usd: 0.004,
                                request_count: 1,
                                priced_success_count: 1,
                            },
                        ],
                    });
                }
                return new Response(null, { status: 204 });
            });
        const requestBody = JSON.stringify({
            model: "mistral-ocr-4",
            document: {
                type: "image_url",
                image_url: "data:image/png;base64,AAAA",
            },
        });

        const paidResponse = await SELF.fetch(
            "https://gen.pollinations.ai/v1/ocr",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${paidApiKey}`,
                    "Content-Type": "application/json",
                },
                body: requestBody,
            },
        );
        expect(paidResponse.status).toBe(200);
        expect(paidResponse.headers.get("x-model-used")).toBe(
            "mistral-ocr-4-0",
        );
        expect(await paidResponse.json()).toEqual(OCR_RESPONSE);

        const providerCalls = fetchMock.mock.calls.filter(
            ([input]) => requestUrl(input) === "https://api.mistral.ai/v1/ocr",
        );
        expect(providerCalls).toHaveLength(1);

        const freeResponse = await SELF.fetch(
            "https://gen.pollinations.ai/v1/ocr",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: requestBody,
            },
        );
        expect(freeResponse.status).toBe(402);
        expect(
            fetchMock.mock.calls.filter(
                ([input]) =>
                    requestUrl(input) === "https://api.mistral.ai/v1/ocr",
            ),
        ).toHaveLength(1);
    },
);
