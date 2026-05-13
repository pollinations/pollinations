import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { test as fixtureTest } from "@shared/test/fixtures/index.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker from "../src/index.ts";
import {
    calculateReplicateProviderBillingDollars,
    isValidReplicateModelSlug,
    parseReplicateTimePricedPage,
} from "../src/replicate/billing.ts";

afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
});

describe("Replicate generic billing", () => {
    it("parses time-priced model pages", () => {
        const parsed = parseReplicateTimePricedPage(`
            <script>{"billingConfig": null, "hardware": "L40S", "price": "$0.000975 per second", "p50price": "$0.0065"}</script>
        `);

        expect(parsed).toEqual({
            dollarsPerSecond: 0.000975,
            priceLabel: "$0.000975 per second",
            hardware: "L40S",
        });
    });

    it("rejects tiered billingConfig pages", () => {
        const parsed = parseReplicateTimePricedPage(`
            <script>{"billingConfig": {"current_tiers": [{"prices": [{"metric": "image_output_count", "price": "$3"}]}]}, "hardware": "H100", "price": "$3"}</script>
        `);

        expect(parsed).toBeNull();
    });

    it("requires a per-second price", () => {
        const parsed = parseReplicateTimePricedPage(`
            <script>{"billingConfig": null, "hardware": "H100", "price": "$3"}</script>
        `);

        expect(parsed).toBeNull();
    });

    it("calculates provider billing dollars", () => {
        expect(
            calculateReplicateProviderBillingDollars({
                predictTimeSeconds: 0.47903636,
                dollarsPerSecond: 0.000975,
            }),
        ).toBeCloseTo(0.000467060451);
        expect(
            calculateReplicateProviderBillingDollars({
                predictTimeSeconds: 60,
                dollarsPerSecond: 0.0061,
            }),
        ).toBeCloseTo(0.366);
    });

    it("validates owner/name slugs", () => {
        expect(isValidReplicateModelSlug("stability-ai/sdxl")).toBe(true);
        expect(
            isValidReplicateModelSlug("black-forest-labs/flux-schnell"),
        ).toBe(true);
        expect(isValidReplicateModelSlug("stability-ai/sdxl:version")).toBe(
            false,
        );
        expect(isValidReplicateModelSlug("https://replicate.com/foo/bar")).toBe(
            false,
        );
    });
});

fixtureTest(
    "generic Replicate route bills succeeded time-priced calls",
    async ({ paidApiKey }) => {
        const fetchMock = vi.fn(
            async (input: string | URL | Request, init?: RequestInit) => {
                const request =
                    input instanceof Request ? input : new Request(input, init);
                const url = new URL(request.url);

                if (url.hostname === "replicate.com") {
                    return new Response(
                        '<script>{"billingConfig": null, "hardware": "L40S", "price": "$0.000975 per second"}</script>',
                        { headers: { "content-type": "text/html" } },
                    );
                }

                if (
                    url.hostname === "api.replicate.com" &&
                    url.pathname === "/v1/models/stability-ai/sdxl"
                ) {
                    return Response.json({
                        latest_version: { id: "version-id" },
                    });
                }

                if (
                    url.hostname === "api.replicate.com" &&
                    url.pathname === "/v1/predictions"
                ) {
                    await expect(request.json()).resolves.toEqual({
                        version: "stability-ai/sdxl:version-id",
                        input: { prompt: "red cube" },
                    });
                    return Response.json(
                        {
                            id: "prediction-id",
                            status: "succeeded",
                            output: ["https://example.com/output.png"],
                            metrics: { predict_time: 0.47903636 },
                        },
                        { status: 201 },
                    );
                }

                return Response.json({ data: [] });
            },
        );
        vi.stubGlobal("fetch", fetchMock);

        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request(
                "https://staging.gen.pollinations.ai/v1/replicate/predictions",
                {
                    method: "POST",
                    headers: {
                        authorization: `Bearer ${paidApiKey}`,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({
                        model: "stability-ai/sdxl",
                        input: { prompt: "red cube" },
                        webhook: "https://attacker.example/webhook",
                    }),
                },
            ),
            {
                ...env,
                REPLICATE_API_TOKEN: "r8_test",
            } as CloudflareBindings,
            ctx,
        );
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        expect(response.headers.get("x-model-used")).toBe("replicate-generic");
        expect(
            Number(response.headers.get("x-usage-billing-dollars")),
        ).toBeCloseTo(0.000467060451);
        expect(
            Number(
                response.headers.get("x-replicate-provider-billing-dollars"),
            ),
        ).toBeCloseTo(0.000467060451);
        await expect(response.json()).resolves.toMatchObject({
            id: "prediction-id",
            status: "succeeded",
        });
    },
);

fixtureTest(
    "generic Replicate route returns failed predictions without billing",
    async ({ paidApiKey }) => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
                const request =
                    input instanceof Request ? input : new Request(input, init);
                const url = new URL(request.url);

                if (url.hostname === "replicate.com") {
                    return new Response(
                        '<script>{"billingConfig": null, "hardware": "L40S", "price": "$0.000975 per second"}</script>',
                        { headers: { "content-type": "text/html" } },
                    );
                }

                if (
                    url.hostname === "api.replicate.com" &&
                    url.pathname === "/v1/models/stability-ai/sdxl"
                ) {
                    return Response.json({
                        latest_version: { id: "version-id" },
                    });
                }

                if (
                    url.hostname === "api.replicate.com" &&
                    url.pathname === "/v1/predictions"
                ) {
                    return Response.json(
                        {
                            id: "prediction-id",
                            status: "failed",
                            error: "invalid input",
                        },
                        { status: 201 },
                    );
                }

                return Response.json({ data: [] });
            }),
        );

        const ctx = createExecutionContext();
        const response = await worker.fetch(
            new Request(
                "https://staging.gen.pollinations.ai/v1/replicate/predictions",
                {
                    method: "POST",
                    headers: {
                        authorization: `Bearer ${paidApiKey}`,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({
                        model: "stability-ai/sdxl",
                        input: { prompt: "" },
                    }),
                },
            ),
            {
                ...env,
                REPLICATE_API_TOKEN: "r8_test",
            } as CloudflareBindings,
            ctx,
        );
        await waitOnExecutionContext(ctx);

        expect(response.status).toBe(200);
        expect(response.headers.get("x-model-used")).toBeNull();
        expect(response.headers.get("x-usage-billing-dollars")).toBeNull();
        await expect(response.json()).resolves.toMatchObject({
            id: "prediction-id",
            status: "failed",
            error: "invalid input",
        });
    },
);
