import { SELF } from "cloudflare:test";
import { expect, test } from "vitest";

test("legacy enter docs paths redirect to gen docs", async () => {
    const response = await SELF.fetch(
        "https://enter.pollinations.ai/api/docs/open-api/generate-schema?format=json",
        { redirect: "manual" },
    );

    expect(response.status).toBe(301);
    expect(response.headers.get("Location")).toBe(
        "https://gen.pollinations.ai/docs/open-api/generate-schema?format=json",
    );
});
