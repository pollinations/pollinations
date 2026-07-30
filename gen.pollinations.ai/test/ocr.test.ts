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
import { CreateChatCompletionRequestSchema } from "@shared/schemas/openai.ts";
import { test as fixtureTest } from "@shared/test/fixtures/index.ts";
import type { Context } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env.ts";
import worker from "@/index.ts";
import { resolveModelDefinition } from "@/middleware/model.ts";
import { resetGenerationModelRegistryCache } from "@/model-registry.ts";
import { generateMistralOcrChatCompletion } from "@/text/mistralOcr.ts";
import type { RequestData } from "@/text/types.ts";

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

function ocrRequest(
    content: unknown[],
    options: Partial<RequestData> = {},
): RequestData {
    return {
        model: "mistral-ocr",
        messages: [{ role: "user", content }],
        ...options,
    };
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

describe("Mistral OCR text adapter", () => {
    it("pins OCR 4, maps image input, and returns a chat completion", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(async () => Response.json(OCR_RESPONSE));

        const completion = await generateMistralOcrChatCompletion(
            contextWithKey(),
            ocrRequest(
                [
                    { type: "text", text: "Extract the document." },
                    {
                        type: "image_url",
                        image_url: {
                            url: "data:image/png;base64,AAAA",
                        },
                    },
                ],
                {
                    include_blocks: true,
                    confidence_scores_granularity: "word",
                },
            ),
        );

        expect(completion.upstreamRequestUrl?.href).toBe(
            "https://api.mistral.ai/v1/ocr",
        );
        expect(
            Object.prototype.propertyIsEnumerable.call(
                completion,
                "upstreamRequestUrl",
            ),
        ).toBe(false);
        expect(JSON.parse(JSON.stringify(completion))).toEqual({
            id: expect.any(String),
            object: "chat.completion",
            created: expect.any(Number),
            model: "mistral-ocr-4-0",
            choices: [
                {
                    index: 0,
                    finish_reason: "stop",
                    message: {
                        role: "assistant",
                        content: "# Invoice\n\nTotal: $12.00",
                        content_blocks: [
                            {
                                type: "ocr_page",
                                ...OCR_RESPONSE.pages[0],
                            },
                        ],
                    },
                },
            ],
            usage: {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
            },
            ocr: OCR_RESPONSE,
        });

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("https://api.mistral.ai/v1/ocr");
        expect(JSON.parse(String(init?.body))).toMatchObject({
            model: "mistral-ocr-4-0",
            document: {
                type: "image_url",
                image_url: "data:image/png;base64,AAAA",
            },
            include_blocks: true,
            confidence_scores_granularity: "word",
        });
    });

    it("maps URL and base64 file content parts to document input", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(async () => Response.json(OCR_RESPONSE));

        await generateMistralOcrChatCompletion(
            contextWithKey(),
            ocrRequest(
                [
                    {
                        type: "file",
                        file: {
                            file_url: "https://example.com/document.pdf",
                        },
                    },
                ],
                { pages: [0] },
            ),
        );
        await generateMistralOcrChatCompletion(
            contextWithKey(),
            ocrRequest(
                [
                    {
                        type: "file",
                        file: {
                            file_data: "AAAA",
                            mime_type: "application/pdf",
                        },
                    },
                ],
                { pages: [0] },
            ),
        );

        expect(
            JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).document,
        ).toEqual({
            type: "document_url",
            document_url: "https://example.com/document.pdf",
        });
        expect(
            JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).document,
        ).toEqual({
            type: "document_url",
            document_url: "data:application/pdf;base64,AAAA",
        });
    });

    it("defaults block metadata off and limits extracted images to five", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockImplementation(async () => Response.json(OCR_RESPONSE));

        await generateMistralOcrChatCompletion(
            contextWithKey(),
            ocrRequest(
                [
                    {
                        type: "image_url",
                        image_url: {
                            url: "https://example.com/document.png",
                        },
                    },
                ],
                { include_image_base64: true },
            ),
        );

        expect(
            JSON.parse(String(fetchMock.mock.calls[0][1]?.body)),
        ).toMatchObject({
            include_blocks: false,
            include_image_base64: true,
            image_limit: 5,
        });
    });

    it("rejects missing, multiple, and streaming document requests", async () => {
        await expect(
            generateMistralOcrChatCompletion(
                contextWithKey(),
                ocrRequest([{ type: "text", text: "No document" }]),
            ),
        ).rejects.toMatchObject({ status: 400 });

        await expect(
            generateMistralOcrChatCompletion(
                contextWithKey(),
                ocrRequest([
                    {
                        type: "file",
                        file: {
                            file_url: "https://example.com/document.pdf",
                        },
                    },
                ]),
            ),
        ).rejects.toMatchObject({
            status: 400,
            message: expect.stringContaining(
                "require an explicit pages selection",
            ),
        });

        await expect(
            generateMistralOcrChatCompletion(
                contextWithKey(),
                ocrRequest([
                    {
                        type: "image_url",
                        image_url: { url: "https://example.com/a.png" },
                    },
                    {
                        type: "image_url",
                        image_url: { url: "https://example.com/b.png" },
                    },
                ]),
            ),
        ).rejects.toMatchObject({ status: 400 });

        await expect(
            generateMistralOcrChatCompletion(
                contextWithKey(),
                ocrRequest(
                    [
                        {
                            type: "image_url",
                            image_url: { url: "https://example.com/a.png" },
                        },
                    ],
                    { stream: true },
                ),
            ),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("rejects a successful upstream response without billable pages", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({
                ...OCR_RESPONSE,
                usage_info: { pages_processed: 0 },
            }),
        );

        await expect(
            generateMistralOcrChatCompletion(
                contextWithKey(),
                ocrRequest(
                    [
                        {
                            type: "file",
                            file: {
                                file_url: "https://example.com/document.pdf",
                            },
                        },
                    ],
                    { pages: [0] },
                ),
            ),
        ).rejects.toMatchObject({ status: 502 });
    });

    it("rejects an oversized upstream response before buffering it", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("{}", {
                headers: {
                    "Content-Length": String(8 * 1024 * 1024 + 1),
                    "Content-Type": "application/json",
                },
            }),
        );

        await expect(
            generateMistralOcrChatCompletion(
                contextWithKey(),
                ocrRequest(
                    [
                        {
                            type: "file",
                            file: {
                                file_url: "https://example.com/document.pdf",
                            },
                        },
                    ],
                    { pages: [0] },
                ),
            ),
        ).rejects.toMatchObject({
            status: 502,
            message: "Mistral OCR response exceeded the supported size limit",
        });
    });

    it("requires a configured provider key", async () => {
        const context = {
            env: {} as CloudflareBindings,
        } as Context<Env>;

        await expect(
            generateMistralOcrChatCompletion(
                context,
                ocrRequest([
                    {
                        type: "file",
                        file: {
                            file_url: "https://example.com/document.pdf",
                        },
                    },
                ]),
            ),
        ).rejects.toBeInstanceOf(UpstreamError);
    });

    it("bills the exact provider-reported page count from the chat response", () => {
        const definition = getRegistryModelDefinition("mistral-ocr");
        const output = {
            ocr: {
                ...OCR_RESPONSE,
                usage_info: { pages_processed: 3 },
            },
        };
        const billing = calculateUsageBilling({
            model: "mistral-ocr",
            usage: {},
            servedBy: definition,
            output,
        });

        expect(countMistralOcrPages(output)).toBe(3);
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

    it("validates page and image limits and rejects separately billed annotations", () => {
        const request = {
            model: "mistral-ocr",
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "file",
                            file: {
                                file_url: "https://example.com/document.pdf",
                            },
                        },
                    ],
                },
            ],
        };

        expect(
            CreateChatCompletionRequestSchema.safeParse({
                ...request,
                pages: "0,2-4",
            }).success,
        ).toBe(true);
        expect(
            CreateChatCompletionRequestSchema.safeParse({
                ...request,
                pages: "9-2",
            }).success,
        ).toBe(false);
        expect(
            CreateChatCompletionRequestSchema.safeParse({
                ...request,
                pages: "0-299",
            }).success,
        ).toBe(true);
        expect(
            CreateChatCompletionRequestSchema.safeParse({
                ...request,
                pages: "0-300",
            }).success,
        ).toBe(false);
        expect(
            CreateChatCompletionRequestSchema.safeParse({
                ...request,
                pages: Array.from({ length: 300 }, (_, index) => index),
                include_image_base64: true,
                image_limit: 5,
            }).success,
        ).toBe(true);
        expect(
            CreateChatCompletionRequestSchema.safeParse({
                ...request,
                pages: Array.from({ length: 301 }, (_, index) => index),
            }).success,
        ).toBe(false);
        expect(
            CreateChatCompletionRequestSchema.safeParse({
                ...request,
                pages: [0],
                include_image_base64: true,
                image_limit: 6,
            }).success,
        ).toBe(false);

        const annotation = CreateChatCompletionRequestSchema.safeParse({
            ...request,
            document_annotation_format: { type: "json_object" },
        });
        expect(annotation.success).toBe(false);
        if (!annotation.success) {
            expect(annotation.error.issues[0]?.message).toContain(
                "annotated pages use separate billing",
            );
        }
    });

    it("keeps OCR-only validation scoped to OCR model names", () => {
        for (const model of [
            "mistral-ocr",
            "mistral-ocr-4",
            "mistral-ocr-4-0",
        ]) {
            expect(
                CreateChatCompletionRequestSchema.safeParse({
                    model,
                    messages: [{ role: "user", content: "extract" }],
                    pages: 5,
                }).success,
            ).toBe(false);
        }

        const nonOcr = CreateChatCompletionRequestSchema.safeParse({
            model: "openai",
            messages: [{ role: "user", content: "hello" }],
            pages: 5,
            document_annotation_format: { type: "json_object" },
        });
        expect(nonOcr.success).toBe(true);
        if (nonOcr.success) {
            expect(nonOcr.data.pages).toBe(5);
            expect(nonOcr.data.document_annotation_format).toEqual({
                type: "json_object",
            });
        }
    });

    it("is available on POST text routes but not the prompt-only GET route", async () => {
        const env = {} as CloudflareBindings;
        for (const endpoint of ["/v1/chat/completions", "/text"]) {
            await expect(
                resolveModelDefinition(
                    "mistral-ocr-4",
                    "generate.text",
                    env,
                    undefined,
                    endpoint,
                ),
            ).resolves.toMatchObject({ resolved: "mistral-ocr" });
        }

        await expect(
            resolveModelDefinition(
                "mistral-ocr",
                "generate.text",
                env,
                undefined,
                "/text/{prompt}",
            ),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("advertises OCR in the text catalogs with per-page pricing", async () => {
        const textModelsResponse = await fetchWorker("/text/models");
        const textModels = (await textModelsResponse.json()) as Array<{
            name: string;
            paid_only: boolean;
            supported_endpoints: string[];
            billing_adjustments: Array<{
                unit: string;
                unit_price: string;
            }>;
        }>;
        expect(textModelsResponse.status).toBe(200);
        expect(
            textModels.find((model) => model.name === "mistral-ocr"),
        ).toMatchObject({
            paid_only: true,
            supported_endpoints: ["/v1/chat/completions", "/text"],
            billing_adjustments: [
                expect.objectContaining({
                    unit: "page",
                    unit_price: "0.004",
                }),
            ],
        });

        const openAiModelsResponse = await fetchWorker("/v1/models");
        const openAiModels = (await openAiModelsResponse.json()) as {
            data: Array<{ id: string; supported_endpoints: string[] }>;
        };
        expect(
            openAiModels.data.find((model) => model.id === "mistral-ocr"),
        ).toMatchObject({
            supported_endpoints: ["/v1/chat/completions", "/text"],
        });
    });
});

fixtureTest(
    "runs OCR through authenticated text routes and enforces paid-only access",
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

        const chatResponse = await SELF.fetch(
            "https://gen.pollinations.ai/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${paidApiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: "mistral-ocr-4",
                    messages: [
                        {
                            role: "user",
                            content: [
                                {
                                    type: "image_url",
                                    image_url: {
                                        url: "data:image/png;base64,AAAA",
                                    },
                                },
                            ],
                        },
                    ],
                }),
            },
        );
        expect(chatResponse.status).toBe(200);
        expect(chatResponse.headers.get("x-cache")).toBeNull();
        expect(chatResponse.headers.get("x-model-used")).toBe(
            "mistral-ocr-4-0",
        );
        const chatBody = await chatResponse.json();
        expect(chatBody).toEqual({
            id: expect.any(String),
            object: "chat.completion",
            created: expect.any(Number),
            model: "mistral-ocr-4-0",
            choices: [
                {
                    index: 0,
                    finish_reason: "stop",
                    message: {
                        role: "assistant",
                        content: "# Invoice\n\nTotal: $12.00",
                        content_blocks: [
                            {
                                type: "ocr_page",
                                ...OCR_RESPONSE.pages[0],
                            },
                        ],
                    },
                },
            ],
            usage: {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0,
            },
            ocr: OCR_RESPONSE,
        });

        const textResponse = await SELF.fetch(
            "https://gen.pollinations.ai/text",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${paidApiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: "mistral-ocr-4-0",
                    pages: [0],
                    messages: [
                        {
                            role: "user",
                            content: [
                                {
                                    type: "file",
                                    file: {
                                        file_url:
                                            "https://example.com/document.pdf",
                                    },
                                },
                            ],
                        },
                    ],
                }),
            },
        );
        expect(textResponse.status).toBe(200);
        expect(textResponse.headers.get("x-cache")).toBeNull();
        expect(await textResponse.text()).toBe("# Invoice\n\nTotal: $12.00");

        for (const body of [
            {
                model: "mistral-ocr",
                pages: "0-300",
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "file",
                                file: {
                                    file_url:
                                        "https://example.com/document.pdf",
                                },
                            },
                        ],
                    },
                ],
            },
            {
                model: "mistral-ocr",
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "file",
                                file: {
                                    file_url:
                                        "https://example.com/document.pdf",
                                },
                            },
                        ],
                    },
                ],
            },
        ]) {
            const rejectedResponse = await SELF.fetch(
                "https://gen.pollinations.ai/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${paidApiKey}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(body),
                },
            );
            expect(rejectedResponse.status).toBe(400);
        }

        expect(
            fetchMock.mock.calls.filter(
                ([input]) =>
                    requestUrl(input) === "https://api.mistral.ai/v1/ocr",
            ),
        ).toHaveLength(2);

        const freeResponse = await SELF.fetch(
            "https://gen.pollinations.ai/v1/chat/completions",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    model: "mistral-ocr",
                    messages: [
                        {
                            role: "user",
                            content: [
                                {
                                    type: "image_url",
                                    image_url: {
                                        url: "data:image/png;base64,BBBB",
                                    },
                                },
                            ],
                        },
                    ],
                }),
            },
        );
        expect(freeResponse.status).toBe(402);
        expect(
            fetchMock.mock.calls.filter(
                ([input]) =>
                    requestUrl(input) === "https://api.mistral.ai/v1/ocr",
            ),
        ).toHaveLength(2);
    },
);
