import { SELF } from "cloudflare:test";
import { describe, expect } from "vitest";
import { test } from "./fixtures.ts";

describe("GET /api/account/key/usage", () => {
    test("forwards the calling key's id to the usage pipe (no scope needed)", async ({
        auth,
        sessionToken,
        mocks,
    }) => {
        await mocks.enable("tinybird");

        const created = await auth.apiKey.create({
            name: "my-key",
            fetchOptions: {
                headers: {
                    Cookie: `better-auth.session_token=${sessionToken}`,
                },
            },
        });
        if (!created.data) throw new Error("Failed to create key");
        const myKeyId = created.data.id;

        mocks.tinybird.state.usageResponse = [
            {
                cursor_event_id: "event-1",
                timestamp: "2026-04-14 12:10:00",
                type: "generate.text",
                model: "openai-fast",
                api_key_id: myKeyId,
                api_key: "my-key",
                api_key_type: "secret",
                meter_source: "tier",
                input_text_tokens: 10,
                input_cached_tokens: 0,
                input_audio_tokens: 0,
                input_image_tokens: 0,
                output_text_tokens: 20,
                output_reasoning_tokens: 0,
                output_audio_tokens: 0,
                output_image_tokens: 0,
                cost_usd: 0.001,
                response_time_ms: 100,
            },
        ];

        const res = await SELF.fetch(
            "http://localhost:3000/api/account/key/usage",
            { headers: { Authorization: `Bearer ${created.data.key}` } },
        );
        expect(res.status).toBe(200);
        const data = (await res.json()) as {
            usage: Array<Record<string, unknown>>;
            count: number;
        };
        expect(data.count).toBe(1);

        const calls = mocks.tinybird.state.pipeCalls.filter((call) =>
            call.url.includes("user_usage.json"),
        );
        expect(calls).toHaveLength(1);
        expect(calls[0].query.api_key_id).toBe(myKeyId);
    });

    test("returns 401 without an API key", async ({ sessionToken }) => {
        const res = await SELF.fetch(
            "http://localhost:3000/api/account/key/usage",
            {
                headers: {
                    Cookie: `better-auth.session_token=${sessionToken}`,
                },
            },
        );
        expect(res.status).toBe(401);
    });
});
