import { SELF } from "cloudflare:test";
import { expect, test } from "vitest";

test("legacy enter docs page redirects to gen docs", async () => {
    const response = await SELF.fetch(
        "https://enter.pollinations.ai/api/docs?format=json",
        { redirect: "manual" },
    );

    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe(
        "https://gen.pollinations.ai/docs?format=json",
    );
});

test("enter docs schema remains available for gen service binding", async () => {
    const response = await SELF.fetch(
        "https://enter.pollinations.ai/api/docs/open-api/generate-schema",
        { redirect: "manual" },
    );

    expect(response.status).toBe(200);
    const schema = (await response.json()) as {
        info?: { description?: string };
        paths?: Record<string, unknown>;
    };

    expect(schema.info?.description).toContain("Quick Start");
    expect(schema.paths?.["/account/profile"]).toBeDefined();
});

test("legacy enter docs redirect keeps the docs path boundary", async () => {
    const response = await SELF.fetch(
        "https://enter.pollinations.ai/api/docss",
        {
            redirect: "manual",
        },
    );

    expect(response.status).not.toBe(301);
    expect(response.headers.get("Location")).toBeNull();
});
