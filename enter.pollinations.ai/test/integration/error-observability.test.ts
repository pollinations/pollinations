import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { describe, expect } from "vitest";
import { createServerErrorFingerprint } from "@/error.ts";
import worker from "@/index.ts";
import { test } from "../fixtures.ts";

describe("Error observability", () => {
    test("fingerprints include the error signature beyond the route prefix", () => {
        const common = {
            routePath: "/api/generate/v1/chat/completions",
            errorClass: "UpstreamError",
            topStackFrame:
                "at /Users/thomash/pollinations/enter.pollinations.ai/src/routes/proxy.ts:189:23",
        };

        expect(
            createServerErrorFingerprint({
                ...common,
                messageNormalized:
                    "stream requested for model openai but upstream returned content-type: application/json",
            }),
        ).not.toBe(
            createServerErrorFingerprint({
                ...common,
                messageNormalized:
                    "upstream provider returned status <num> for model openai",
            }),
        );
    });

    test(
        "emits structured Tinybird error events for actionable upstream failures",
        { timeout: 30000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "text");
            mocks.text.state.forceNonStreaming = true;

            const ctx = createExecutionContext();
            const response = await worker.fetch(
                new Request(
                    "http://localhost:3000/api/generate/v1/chat/completions",
                    {
                        method: "POST",
                        headers: {
                            "content-type": "application/json",
                            authorization: `Bearer ${paidApiKey}`,
                        },
                        body: JSON.stringify({
                            model: "openai",
                            stream: true,
                            messages: [
                                {
                                    role: "user",
                                    content: "Return a short streamed reply.",
                                },
                            ],
                        }),
                    },
                ),
                env,
                ctx,
            );

            expect(response.status).toBe(502);
            await response.text();
            await waitOnExecutionContext(ctx);

            expect(mocks.tinybird.state.errorEvents).toHaveLength(1);
            expect(mocks.tinybird.state.errorEvents[0]).toMatchObject({
                kind: "server_error",
                status: 502,
                error_class: "UpstreamError",
                route_path: "/api/generate/v1/chat/completions",
                upstream_host: "ec2-54-147-14-220.compute-1.amazonaws.com",
                upstream_status: 200,
                upstream_body: "application/json",
            });
        },
    );
});
