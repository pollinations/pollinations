import { env, SELF } from "cloudflare:test";
import { apikey } from "@shared/db/better-auth.ts";
import { createTestApiKey, test } from "@shared/test/fixtures/index.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";

async function fetchWorker(path: string, init: RequestInit = {}) {
    return SELF.fetch(new Request(`https://gen.pollinations.ai${path}`, init));
}

test("query filter matches canonical names case-insensitively", async () => {
    const response = await fetchWorker("/models?query=FLUX");
    expect(response.status).toBe(200);
    const models = (await response.json()) as { name: string }[];
    expect(models.length).toBeGreaterThan(0);
    for (const model of models) {
        expect(model.name.toLowerCase()).toContain("flux");
    }
});

test("query filter matches aliases", async () => {
    const response = await fetchWorker("/models?query=openai/gpt-4o");
    expect(response.status).toBe(200);
    const models = (await response.json()) as { name: string; aliases?: string[] }[];
    expect(models.length).toBeGreaterThan(0);
    for (const model of models) {
        const haystack = [model.name, ...(model.aliases ?? [])].join(" ").toLowerCase();
        expect(haystack).toContain("openai/gpt-4o");
    }
});

test("query filter requires every whitespace-separated word", async () => {
    const response = await fetchWorker("/models?query=flux+nonexistentword12345");
    expect(response.status).toBe(200);
    const models = (await response.json()) as { name: string }[];
    expect(models).toHaveLength(0);
});

test("capabilities filter keeps only models with every listed capability", async () => {
    const response = await fetchWorker("/models?capabilities=tool_calling,reasoning");
    expect(response.status).toBe(200);
    const models = (await response.json()) as { name: string; capabilities?: string[] }[];
    expect(models.length).toBeGreaterThan(0);
    for (const model of models) {
        const caps = new Set(model.capabilities ?? []);
        expect(caps.has("tool_calling")).toBe(true);
        expect(caps.has("reasoning")).toBe(true);
    }
});

test("capabilities filter rejects unknown values with 400", async () => {
    const response = await fetchWorker("/models?capabilities=not_a_real_capability");
    expect(response.status).toBe(400);
});

test("agent filter returns only agents when true", async () => {
    const response = await fetchWorker("/models?agent=true");
    expect(response.status).toBe(200);
    const models = (await response.json()) as { name: string; agent?: boolean }[];
    expect(models.length).toBeGreaterThan(0);
    for (const model of models) {
        expect(model.agent).toBe(true);
    }
});

test("agent filter excludes agents when false", async () => {
    const response = await fetchWorker("/models?agent=false");
    expect(response.status).toBe(200);
    const models = (await response.json()) as { name: string; agent?: boolean }[];
    expect(models.length).toBeGreaterThan(0);
    for (const model of models) {
        expect(model.agent).not.toBe(true);
    }
});

test("limit caps the result after all other filters", async () => {
    const all = await fetchWorker("/models");
    const allModels = (await all.json()) as { name: string }[];
    const limited = await fetchWorker("/models?limit=3");
    expect(limited.status).toBe(200);
    const limitedModels = (await limited.json()) as { name: string }[];
    expect(limitedModels).toHaveLength(3);
    // The first 3 of the unfiltered catalog must be the same 3.
    expect(limitedModels.map((m) => m.name)).toEqual(
        allModels.slice(0, 3).map((m) => m.name),
    );
});

test("combined filters apply AND semantics", async () => {
    const response = await fetchWorker("/models?query=flux&capabilities=tool_calling&limit=2");
    expect(response.status).toBe(200);
    const models = (await response.json()) as { name: string; capabilities?: string[] }[];
    expect(models.length).toBeLessThanOrEqual(2);
    for (const model of models) {
        expect(model.name.toLowerCase()).toContain("flux");
        const caps = new Set(model.capabilities ?? []);
        expect(caps.has("tool_calling")).toBe(true);
    }
});

test("private visibility models appear under filters for restricted keys", async () => {
    const { key, id } = await createTestApiKey({
        allowedModels: ["openai/gpt-4o-mini"],
        user: { packBalance: 100 },
    });
    await drizzle(env.DB)
        .update(apikey)
        .set({ permissions: JSON.stringify({ models: ["openai/gpt-4o-mini"] }) })
        .where(eq(apikey.id, id));
    const headers = { Authorization: `Bearer ${key}` };
    const response = await fetchWorker("/models?query=gpt-4o&limit=5", { headers });
    expect(response.status).toBe(200);
    const models = (await response.json()) as { name: string }[];
    expect(models.length).toBeGreaterThan(0);
    for (const model of models) {
        expect(model.name).toContain("gpt-4o");
    }
});

test("reliability filter runs before limit", async () => {
    const reliable = await fetchWorker("/models?reliability=reliable&limit=5");
    expect(reliable.status).toBe(200);
    const reliableModels = (await reliable.json()) as { name: string }[];
    expect(reliableModels).toHaveLength(5);
    const all = await fetchWorker("/models?reliability=all&limit=5");
    expect(all.status).toBe(200);
    const allModels = (await all.json()) as { name: string }[];
    expect(allModels).toHaveLength(5);
    // Both return 5 models; the reliable set is a subset of the all set.
    const allNames = new Set(allModels.map((m) => m.name));
    for (const model of reliableModels) {
        expect(allNames.has(model.name)).toBe(true);
    }
});
