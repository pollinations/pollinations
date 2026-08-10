import { describe, expect, it, vi } from "vitest";
import { generateTextPortkey } from "../../src/text/generateTextPortkey.js";

describe("generateTextPortkey", () => {
    it("sets an owned request deadline below the public gateway limit", async () => {
        const fetcher = vi.fn(
            async (_input: RequestInfo | URL, init?: RequestInit) => {
                const headers = new Headers(init?.headers);
                expect(headers.get("x-portkey-request-timeout")).toBe("290000");
                expect(headers.get("x-portkey-strict-open-ai-compliance")).toBe(
                    "false",
                );

                return Response.json({
                    model: "provider-model",
                    choices: [
                        {
                            index: 0,
                            message: { role: "assistant", content: "ok" },
                            finish_reason: "stop",
                        },
                    ],
                });
            },
        );

        const completion = await generateTextPortkey(
            [{ role: "user", content: "hello" }],
            {
                model: "provider-model",
                modelConfig: {
                    provider: "openai",
                    model: "provider-model",
                },
                portkeyGatewayUrl: "https://portkey.test",
            },
            fetcher,
        );

        expect(fetcher).toHaveBeenCalledOnce();
        expect(completion.choices?.[0]?.message?.content).toBe("ok");
    });
});
