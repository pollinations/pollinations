import { SELF } from "cloudflare:test";
import { requestExampleErrors } from "@shared/test/api-examples.ts";
import {
    isPublicEnterPath,
    publicEnterPath,
} from "@shared/utils/public-docs.ts";
import { expect, test } from "vitest";
import type { Spec } from "../../gen.pollinations.ai/scripts/generate-apidocs.ts";

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
    const schema = (await response.json()) as Spec;

    expect(schema.paths?.["/account/profile"]).toBeDefined();
    expect(schema.paths?.["/account/quests"]).toBeDefined();
    expect(schema.paths?.["/account/my-models"]).toBeDefined();
    expect(schema.paths?.["/account/agents"]).toBeDefined();

    const publicSchema = {
        ...schema,
        paths: Object.fromEntries(
            Object.entries(schema.paths)
                .filter(([path]) => isPublicEnterPath(path))
                .map(([path, operations]) => [
                    publicEnterPath(path),
                    operations,
                ]),
        ),
    };
    expect(requestExampleErrors(publicSchema)).toEqual([]);
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
