import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { getUserBalance } from "@shared/billing/balance.ts";
import type { TinybirdEvent } from "@shared/schemas/generation-event.ts";
import { createTestApiKey } from "@shared/test/fixtures/index.ts";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../../src/index.ts";
import { withInlineGenerationCoordinator } from "../helpers/inline-generation-coordinator.ts";

const db = drizzle(env.DB);

const MISTRAL_OCR_URL = "https://api.mistral.ai/v1/ocr";
const PAGES_PROCESSED = 3;
const PRICE_PER_PAGE = 0.004;

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
    usage_info: { pages_processed: PAGES_PROCESSED, doc_size_bytes: 12345 },
};

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

async function fetchGen(
    input: RequestInfo | URL,
    init?: RequestInit,
): Promise<Response> {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(input, init),
        withInlineGenerationCoordinator(env),
        ctx,
    );
    const body = response.body ? await response.arrayBuffer() : null;
    await waitOnExecutionContext(ctx);
    return new Response(body, response);
}

describe("POST /alpha/ocr", () => {
    it("bills the wallet from the page count the provider reported", async () => {
        const caller = await createTestApiKey({
            user: { tierBalance: 1, packBalance: 0 },
        });
        const before = await getUserBalance(db, caller.userId);
        const events: TinybirdEvent[] = [];
        let upstreamUrl = "";
        let upstreamAuth: string | null = null;
        let upstreamBody: Record<string, unknown> | undefined;

        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const request = new Request(input, init);
                if (request.url === MISTRAL_OCR_URL) {
                    upstreamUrl = request.url;
                    upstreamAuth = request.headers.get("authorization");
                    upstreamBody = (await request.json()) as Record<
                        string,
                        unknown
                    >;
                    return Response.json(OCR_RESPONSE);
                }
                if (request.url.startsWith("http://localhost:7181/")) {
                    events.push(
                        ...((await request.text())
                            .split("\n")
                            .filter((line) => line.trim().length > 0)
                            .map((line) =>
                                JSON.parse(line),
                            ) as TinybirdEvent[]),
                    );
                    return Response.json({ data: [] });
                }
                throw new Error(`Unexpected fetch: ${request.url}`);
            }),
        );

        const response = await fetchGen(
            new Request("https://gen.pollinations.ai/alpha/ocr", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${caller.key}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    document: {
                        type: "document_url",
                        document_url: "https://example.com/invoice.pdf",
                    },
                    include_image_base64: false,
                }),
            }),
        );
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual(OCR_RESPONSE);
        expect(upstreamUrl).toBe(MISTRAL_OCR_URL);
        expect(upstreamAuth).toBe(`Bearer ${env.MISTRAL_API_KEY as string}`);
        expect(upstreamBody).toMatchObject({
            model: "mistral-ocr-latest",
            document: {
                type: "document_url",
                document_url: "https://example.com/invoice.pdf",
            },
            include_image_base64: false,
        });
        expect(response.headers.get("x-model-used")).toBe("mistral-ocr");
        expect(response.headers.get("x-usage-prompt-image-tokens")).toBe(
            String(PAGES_PROCESSED),
        );

        const after = await getUserBalance(db, caller.userId);
        expect(before.tierBalance - after.tierBalance).toBeCloseTo(
            PAGES_PROCESSED * PRICE_PER_PAGE,
            10,
        );

        const billed = events.filter((event) => event.isBilledUsage === true);
        expect(billed).toHaveLength(1);
        expect(billed[0]).toMatchObject({
            modelUsed: "mistral-ocr",
            tokenCountPromptImage: PAGES_PROCESSED,
        });
        expect(billed[0].totalPrice).toBeCloseTo(
            PAGES_PROCESSED * PRICE_PER_PAGE,
            10,
        );
    });

    it.each([
        ["a non-https scheme", "http://example.com/invoice.pdf"],
        ["a file scheme", "file:///etc/passwd"],
        ["a private host", "https://169.254.169.254/latest/meta-data"],
        ["embedded credentials", "https://user:pass@example.com/invoice.pdf"],
    ])("rejects document_url with %s", async (_label, documentUrl) => {
        const caller = await createTestApiKey({
            user: { tierBalance: 1, packBalance: 0 },
        });
        const before = await getUserBalance(db, caller.userId);
        const upstream = vi.fn(async () => Response.json(OCR_RESPONSE));
        vi.stubGlobal("fetch", upstream);

        const response = await fetchGen(
            new Request("https://gen.pollinations.ai/alpha/ocr", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${caller.key}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    document: {
                        type: "document_url",
                        document_url: documentUrl,
                    },
                }),
            }),
        );

        expect(response.status).toBe(400);
        expect(upstream).not.toHaveBeenCalled();
        expect(await getUserBalance(db, caller.userId)).toEqual(before);
    });

    it("re-runs the upstream for an identical request instead of serving a stored response", async () => {
        const caller = await createTestApiKey({
            user: { tierBalance: 1, packBalance: 0 },
        });
        const before = await getUserBalance(db, caller.userId);
        const changedResponse = {
            ...OCR_RESPONSE,
            pages: OCR_RESPONSE.pages.map((page) => ({
                ...page,
                markdown: "Invoice #42\nTotal: $999",
            })),
            usage_info: { pages_processed: 1 },
        };
        const upstreamResponses = [OCR_RESPONSE, changedResponse];
        let upstreamCalls = 0;

        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const request = new Request(input, init);
                if (request.url === MISTRAL_OCR_URL) {
                    const next =
                        upstreamResponses[
                            Math.min(
                                upstreamCalls,
                                upstreamResponses.length - 1,
                            )
                        ];
                    upstreamCalls += 1;
                    return Response.json(next);
                }
                if (request.url.startsWith("http://localhost:7181/")) {
                    return Response.json({ data: [] });
                }
                throw new Error(`Unexpected fetch: ${request.url}`);
            }),
        );

        const send = () =>
            fetchGen(
                new Request("https://gen.pollinations.ai/alpha/ocr", {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${caller.key}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        document: {
                            type: "document_url",
                            document_url: "https://example.com/invoice.pdf",
                        },
                    }),
                }),
            );

        const first = await send();
        const second = await send();

        expect(first.status).toBe(200);
        expect(await first.json()).toEqual(OCR_RESPONSE);
        expect(second.status).toBe(200);
        expect(await second.json()).toEqual(changedResponse);
        expect(upstreamCalls).toBe(2);
        expect(
            before.tierBalance -
                (await getUserBalance(db, caller.userId)).tierBalance,
        ).toBeCloseTo((PAGES_PROCESSED + 1) * PRICE_PER_PAGE, 10);
    });

    it("charges nothing when the upstream provider fails", async () => {
        const caller = await createTestApiKey({
            user: { tierBalance: 1, packBalance: 0 },
        });
        const before = await getUserBalance(db, caller.userId);
        vi.stubGlobal(
            "fetch",
            vi.fn(
                async () =>
                    new Response(JSON.stringify({ message: "rate limited" }), {
                        status: 429,
                    }),
            ),
        );

        const response = await fetchGen(
            new Request("https://gen.pollinations.ai/alpha/ocr", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${caller.key}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    document: {
                        type: "document_url",
                        document_url: "https://example.com/invoice.pdf",
                    },
                }),
            }),
        );

        expect(response.status).toBe(502);
        expect(await response.text()).toContain("rate limited");
        expect(await getUserBalance(db, caller.userId)).toEqual(before);
    });
});
