import { SELF } from "cloudflare:test";
import { requestExampleErrors } from "@shared/test/api-examples.ts";
import { expect, test } from "vitest";
import type { Spec } from "../../gen.pollinations.ai/scripts/generate-apidocs.ts";

test("media generates valid public API request examples", async () => {
    const response = await SELF.fetch(
        "https://media.pollinations.ai/openapi.json",
    );
    expect(response.status).toBe(200);
    const schema = (await response.json()) as Spec;
    expect(schema.paths["/upload"]).toBeDefined();
    expect(requestExampleErrors(schema)).toEqual([]);
});
