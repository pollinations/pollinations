import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { getUserBalance } from "@shared/billing/balance.ts";
import { createTestApiKey } from "@shared/test/fixtures/index.ts";
import {
    createFetchMock,
    teardownFetchMock,
} from "@shared/test/mocks/fetch.ts";
import { createMockTinybird } from "@shared/test/mocks/tinybird.ts";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, test } from "vitest";
import worker from "../../src/index.ts";
import { withInlineGenerationCoordinator } from "../helpers/inline-generation-coordinator.ts";

const model = "black-forest-labs/flux.1.1-pro";
const east = "myceli-prod-eastus.cognitiveservices.azure.com";
const sweden = "myceli-prod-swedencentral.cognitiveservices.azure.com";
const refusal = { data: [], stop_reason: "refusal" };
const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

afterEach(teardownFetchMock);

describe.each(["native", "openai"] as const)(
    "FLUX 1.1 Pro through %s",
    (surface) => {
        test.for([
            {
                scenario: "primary refusal",
                primaryFails: false,
                outcome: "refusal",
            },
            {
                scenario: "fallback refusal",
                primaryFails: true,
                outcome: "refusal",
            },
            {
                scenario: "unexplained empty output",
                primaryFails: false,
                outcome: "empty",
            },
            {
                scenario: "fallback success and cache replay",
                primaryFails: true,
                outcome: "success",
            },
        ])("$scenario", async ({ primaryFails, outcome }) => {
            const { key, userId } = await createTestApiKey({
                user: { packBalance: 100 },
            });
            const requests: string[] = [];
            const provider = async (request: Request) => {
                const url = new URL(request.url);
                expect(url.pathname).toBe(
                    "/providers/blackforestlabs/v1/flux-pro-1.1",
                );
                requests.push(url.hostname);
                if (primaryFails && url.hostname === east) {
                    return Response.json(
                        { error: { message: "Provider unavailable" } },
                        { status: 503 },
                    );
                }
                return Response.json(
                    outcome === "refusal"
                        ? refusal
                        : outcome === "empty"
                          ? { data: [] }
                          : { data: [{ b64_json: png }] },
                    { headers: { "x-ms-request-id": "flux-response" } },
                );
            };
            const mocks = createFetchMock({
                tinybird: createMockTinybird(),
                azure: {
                    state: requests,
                    handlerMap: {
                        [east]: provider,
                        [sweden]: provider,
                        "content-safety.test": async () =>
                            Response.json({ categoriesAnalysis: [] }),
                    },
                    reset: () => {
                        requests.length = 0;
                    },
                },
            });
            await mocks.enable("tinybird", "azure");
            const bindings = withInlineGenerationCoordinator({
                ...env,
                AZURE_MYCELI_PROD_API_KEY: "test-azure-key",
                AZURE_MYCELI_PROD_SWEDEN_API_KEY: "test-sweden-key",
                AZURE_CONTENT_SAFETY_ENDPOINT: "https://content-safety.test",
                AZURE_CONTENT_SAFETY_API_KEY: "test-safety-key",
            });
            const before = await getUserBalance(drizzle(env.DB), userId);
            const prompt = `A blue ceramic teapot ${crypto.randomUUID()}`;
            const request = () =>
                surface === "native"
                    ? new Request(
                          `https://gen.pollinations.ai/image/${encodeURIComponent(prompt)}?model=${model}&width=1024&height=1024&seed=42`,
                          { headers: { authorization: `Bearer ${key}` } },
                      )
                    : new Request(
                          "https://gen.pollinations.ai/v1/images/generations",
                          {
                              method: "POST",
                              headers: {
                                  authorization: `Bearer ${key}`,
                                  "content-type": "application/json",
                              },
                              body: JSON.stringify({
                                  model,
                                  prompt,
                                  size: "1024x1024",
                                  seed: 42,
                                  response_format: "b64_json",
                              }),
                          },
                      );

            for (const cache of outcome === "success"
                ? ["MISS", "HIT"]
                : ["MISS"]) {
                const ctx = createExecutionContext();
                const response = await worker.fetch(request(), bindings, ctx);
                if (outcome === "success") {
                    expect(response.status).toBe(200);
                    expect(response.headers.get("x-cache")).toBe(cache);
                    const bytes =
                        surface === "native"
                            ? Buffer.from(await response.arrayBuffer())
                            : Buffer.from(
                                  (
                                      await response.json<{
                                          data: { b64_json: string }[];
                                      }>()
                                  ).data[0].b64_json,
                                  "base64",
                              );
                    expect(bytes).toEqual(Buffer.from(png, "base64"));
                } else {
                    expect(response.status).toBe(
                        outcome === "refusal" ? 422 : 502,
                    );
                    const body = await response.json<{
                        error: {
                            code: string;
                            details: Record<string, unknown>;
                        };
                    }>();
                    expect(body.error).toMatchObject({
                        code:
                            outcome === "refusal"
                                ? "content_policy_violation"
                                : "BAD_GATEWAY",
                        details: {
                            upstreamHost:
                                primaryFails || outcome === "empty"
                                    ? sweden
                                    : east,
                            upstreamStatus: 200,
                        },
                    });
                    if (outcome === "refusal") {
                        expect(body.error.details.upstreamBody).toBe(
                            JSON.stringify(refusal),
                        );
                    }
                }
                await waitOnExecutionContext(ctx);
            }

            expect(requests).toEqual(
                primaryFails || outcome === "empty" ? [east, sweden] : [east],
            );
            const events = mocks.tinybird.state.events;
            const billed = events.filter((event) => event.isBilledUsage);
            const after = await getUserBalance(drizzle(env.DB), userId);
            if (outcome === "success") {
                expect(billed).toHaveLength(1);
                expect(billed[0]).toMatchObject({
                    totalCost: 0.04,
                    totalPrice: 0.03,
                    fallbackUsed: true,
                });
                expect(before.packBalance - after.packBalance).toBeCloseTo(
                    0.03,
                    8,
                );
            } else {
                expect(billed).toHaveLength(0);
                expect(after).toEqual(before);
                expect(events.filter((event) => event.isFinal)).toEqual([
                    expect.objectContaining({
                        responseStatus: outcome === "refusal" ? 422 : 502,
                        errorResponseCode:
                            outcome === "refusal"
                                ? "content_policy_violation"
                                : "BAD_GATEWAY",
                        isBilledUsage: false,
                    }),
                ]);
            }
        });
    },
);
