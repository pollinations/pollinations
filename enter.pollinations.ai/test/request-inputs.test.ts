import { collectRequestInputs } from "@shared/observability/request-inputs.ts";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";

describe("request input redaction", () => {
    it("redacts custom header objects from error inputs", async () => {
        const app = new Hono().post("/", async (c) =>
            c.json(await collectRequestInputs(c)),
        );
        const response = await app.request("/", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                mcpServers: [
                    {
                        name: "docs",
                        headers: {
                            "X-Custom-Credential": "must-not-be-logged",
                        },
                    },
                ],
            }),
        });

        await expect(response.json()).resolves.toMatchObject({
            body: {
                mcpServers: [{ name: "docs", headers: "[redacted]" }],
            },
        });
    });
});
