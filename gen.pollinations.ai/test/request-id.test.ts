import { requestId } from "@shared/middleware/request-id.ts";
import { Hono } from "hono";
import type { RequestIdVariables } from "hono/request-id";
import { describe, expect, it } from "vitest";

describe("shared request-id middleware", () => {
    it("ignores a spoofed inbound X-Request-Id and mints its own", async () => {
        const app = new Hono<{ Variables: RequestIdVariables }>()
            .use("*", requestId())
            .get("/", (c) => c.json({ requestId: c.get("requestId") }));

        const spoofed = "attacker-controlled-id";
        const response = await app.request("/", {
            headers: { "X-Request-Id": spoofed },
        });

        const body = (await response.json()) as { requestId: string };
        const echoedHeader = response.headers.get("X-Request-Id");

        expect(echoedHeader).not.toBe(spoofed);
        expect(echoedHeader).toBe(body.requestId);
        expect(body.requestId).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
    });
});
