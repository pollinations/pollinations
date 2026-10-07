import { SELF } from "cloudflare:test";
import {
    RESTRICTED_TEST_CATEGORIES,
    test,
} from "@shared/test/fixtures/index.ts";
import { expect } from "vitest";

// Focused coverage for the quest-16168 model-list filters: query search,
// capabilities AND semantics, agent filtering, limit truncation after the
// existing visibility/permission/source/reliability pipeline, category
// routes, authenticated/private-model visibility, and boundary handling.

async function fetchWorker(path: string, init: RequestInit = {}) {
    return SELF.fetch(new Request(`https://gen.pollinations.ai${path}`, init));
}

type ModelJson = {
    name: string;
    aliases?: string[];
    title?: string;
    description?: string;
    publisher?: string;
    category?: string;
    capabilities?: string[];
    agent?: boolean;
};

async function listModels(path: string): Promise<ModelJson[]> {
    const response = await fetchWorker(path);
    expect(response.status, path).toBe(200);
    const body = (await response.json()) as unknown;
    if (Array.isArray(body)) {
        return body as ModelJson[];
    }
    return (body as { data: ModelJson[] }).data;
}

const searchableText = (model: ModelJson) =>
    [
        model.name,
        ...(model.aliases ?? []),
        model.title,
        model.description ?? "",
        model.publisher ?? "",
    ]
        .join(" ")
        .toLowerCase();

test("query narrows the catalog by canonical name and is case-insensitive", async () => {
    const all = await listModels("/models?reliability=all");
    const gptNano = await listModels(
        "/models?reliability=all&query=gpt-5-nano",
    );
    const upper = await listModels("/models?reliability=all&query=GPT-5-NANO");
    expect(gptNano.length).toBeGreaterThan(0);
    expect(gptNano.length).toBeLessThan(all.length);
    expect(new Set(upper.map((m) => m.name))).toEqual(
        new Set(gptNano.map((m) => m.name)),
    );
    expect(
        gptNano.some((m) => m.name.toLowerCase().includes("gpt-5-nano")),
    ).toBe(true);
});

test("query tokens must all match across searchable catalog text (AND)", async () => {
    const flux = await listModels("/models?reliability=all&query=flux");
    const fluxSchnell = await listModels(
        "/models?reliability=all&query=flux schnell",
    );
    expect(flux.length).toBeGreaterThan(0);
    expect(fluxSchnell.length).toBeLessThan(flux.length);
    const fluxNames = new Set(flux.map((m) => m.name));
    for (const model of fluxSchnell) {
        expect(fluxNames.has(model.name)).toBe(true);
        const searchable = searchableText(model);
        expect(searchable.includes("flux")).toBe(true);
        expect(searchable.includes("schnell")).toBe(true);
    }
});

test("blank query values are ignored", async () => {
    const full = await listModels("/models");
    const empty = await listModels("/models?query=");
    const blank = await listModels("/models?query=%20%20");
    expect(empty.length).toBe(full.length);
    expect(blank.length).toBe(full.length);
});

test("capabilities filter requires every listed capability (AND)", async () => {
    const reasoning = await listModels(
        "/models?reliability=all&capabilities=reasoning",
    );
    const both = await listModels(
        "/models?reliability=all&capabilities=reasoning,tool_calling",
    );
    expect(reasoning.length).toBeGreaterThan(0);
    for (const model of reasoning) {
        expect(model.capabilities).toContain("reasoning");
    }
    const expectedBoth = reasoning
        .filter((m) => m.capabilities?.includes("tool_calling"))
        .map((m) => m.name)
        .sort();
    expect(expectedBoth.length).toBeGreaterThan(0);
    expect(both.map((m) => m.name).sort()).toEqual(expectedBoth);
});

test("duplicate capabilities collapse without error", async () => {
    const response = await fetchWorker(
        "/models?reliability=all&capabilities=reasoning,reasoning",
    );
    expect(response.status).toBe(200);
    const models = (await response.json()) as ModelJson[];
    expect(models.length).toBeGreaterThan(0);
    for (const model of models) {
        expect(model.capabilities).toContain("reasoning");
    }
});

test("agent filter separates agents from non-agents", async () => {
    const all = await listModels("/models?reliability=all");
    const agents = await listModels("/models?reliability=all&agent=true");
    const nonAgents = await listModels("/models?reliability=all&agent=false");
    expect(agents.map((m) => m.name).sort()).toEqual(
        all
            .filter((m) => m.agent === true)
            .map((m) => m.name)
            .sort(),
    );
    expect(nonAgents.map((m) => m.name).sort()).toEqual(
        all
            .filter((m) => m.agent !== true)
            .map((m) => m.name)
            .sort(),
    );
});

test("limit truncates after visibility and reliability, preserving order", async () => {
    const full = await listModels("/models");
    const limited = await listModels("/models?limit=3");
    expect(limited.length).toBe(3);
    expect(limited.map((m) => m.name)).toEqual(
        full.slice(0, 3).map((m) => m.name),
    );
});

test("category model-list routes accept the same filters", async () => {
    const allText = await listModels("/text/models");
    const textNano = await listModels("/text/models?query=gpt-5-nano");
    expect(textNano.length).toBeGreaterThan(0);
    expect(textNano.length).toBeLessThan(allText.length);

    const imageFlux = await listModels("/image/models?query=flux&limit=5");
    expect(imageFlux.length).toBeGreaterThan(0);
    expect(imageFlux.length).toBeLessThanOrEqual(5);
    for (const model of imageFlux) {
        expect(searchableText(model).includes("flux")).toBe(true);
    }
});

test("API-key permission filtering applies before limit truncation", async ({
    restrictedApiKey,
}) => {
    const headers = { Authorization: `Bearer ${restrictedApiKey}` };
    // The restricted fixture key is allowed only the categories in
    // RESTRICTED_TEST_CATEGORIES; build the expected model-id universe from
    // the same category routes the key may use, then assert /v1/models
    // returns nothing outside it.
    const allModels = await listModels("/models?reliability=all");
    const allowedCategories = [...RESTRICTED_TEST_CATEGORIES] as string[];
    const allowed = new Set(
        allModels
            .filter((m) => m.category && allowedCategories.includes(m.category))
            .map((m) => m.name),
    );
    const response = await fetchWorker("/v1/models?limit=500", { headers });
    expect(response.status).toBe(200);
    const ids = (
        (await response.json()) as { data: { id: string }[] }
    ).data.map((m) => m.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => allowed.has(id))).toBe(true);

    const limited = await fetchWorker("/v1/models?limit=1", { headers });
    const limitedIds = (
        (await limited.json()) as {
            data: { id: string }[];
        }
    ).data.map((m) => m.id);
    expect(limitedIds.length).toBe(1);
    expect(allowed.has(limitedIds[0])).toBe(true);
});

test("paid-only visibility survives combined query and limit filters", async ({
    apiKey,
    paidApiKey,
}) => {
    // elevenlabs/eleven-flash-v2.5 is marked paidOnly in the registry: it
    // must stay hidden for a free key and visible for a paid key even when
    // query and limit filters are applied at the same time.
    const paidOnlyModel = "elevenlabs/eleven-flash-v2.5";
    const freeResponse = await fetchWorker(
        `/audio/models?query=flash&limit=5`,
        { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    expect(freeResponse.status).toBe(200);
    const freeNames = ((await freeResponse.json()) as { name: string }[]).map(
        (m) => m.name,
    );
    expect(freeNames).not.toContain(paidOnlyModel);

    const paidResponse = await fetchWorker(
        `/audio/models?query=flash&limit=5`,
        { headers: { Authorization: `Bearer ${paidApiKey}` } },
    );
    expect(paidResponse.status).toBe(200);
    const paidNames = ((await paidResponse.json()) as { name: string }[]).map(
        (m) => m.name,
    );
    expect(paidNames).toContain(paidOnlyModel);
});

test("boundary parameters return 400 without querying the catalog", async () => {
    const cases = [
        `/v1/models?query=${"a".repeat(201)}`,
        "/v1/models?capabilities=unknown_capability",
        `/v1/models?capabilities=${Array.from(
            { length: 11 },
            () => "tool_calling",
        ).join(",")}`,
        "/v1/models?limit=0",
        "/v1/models?limit=501",
        "/v1/models?limit=abc",
        "/v1/models?agent=yes",
    ];
    for (const path of cases) {
        const response = await fetchWorker(path);
        expect(response.status, path).toBe(400);
    }
});
