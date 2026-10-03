import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import type { ModelHealthRow } from "@shared/model-health.ts";
import {
    RESTRICTED_TEXT_TEST_MODEL,
    test,
} from "@shared/test/fixtures/index.ts";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { resetGenerationModelRegistryCache } from "../src/model-registry.ts";

async function fetchWorker(path: string, init: RequestInit = {}) {
    const { default: worker } = await import("../src/index.ts");
    const context = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://gen.pollinations.ai${path}`, init),
        { ...env, ENVIRONMENT: "test" } as CloudflareBindings,
        context,
    );
    await waitOnExecutionContext(context);
    return response;
}

beforeEach(() => {
    mockCatalogHealth([]);
});

afterEach(async () => {
    await resetGenerationModelRegistryCache(env);
    vi.restoreAllMocks();
});

function mockCatalogHealth(rows: ModelHealthRow[]) {
    vi.restoreAllMocks();
    const originalFetch = globalThis.fetch;
    return vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (input, init) => {
            const url = new URL(
                input instanceof Request ? input.url : String(input),
            );
            if (
                url.pathname === "/v0/pipes/model_catalog_health.json" ||
                url.pathname === "/v0/pipes/model_route_health.json"
            ) {
                return Response.json({ data: rows }, { status: 200 });
            }
            return originalFetch(input, init);
        });
}

type CatalogModel = {
    name: string;
    title: string;
    description?: string;
    publisher: string;
    aliases: string[];
    capabilities: string[];
    agent?: boolean;
};

const searchable = (model: CatalogModel): string[] => [
    model.name,
    model.title,
    model.description ?? "",
    model.publisher,
    ...model.aliases,
];

const list = async (path: string): Promise<CatalogModel[]> => {
    const response = await fetchWorker(path);
    expect(response.status, path).toBe(200);
    return (await response.json()) as CatalogModel[];
};

const fetchList = (query: string): Promise<CatalogModel[]> =>
    list(query ? `/models?reliability=all&${query}` : "/models?reliability=all");

test("narrows the model list with a case-insensitive text query", async () => {
    const all = await fetchList("");
    expect(all.length).toBeGreaterThan(5);

    // A term that matches nothing returns nothing, so the filter really runs.
    expect(await fetchList("query=zzz-no-such-model")).toEqual([]);

    // Name, aliases, title, description, and publisher all match, and the
    // search is case-insensitive.
    const probe = all[0];
    const words = probe.name.toLowerCase().split(/\s+/);
    const expected = all.filter((model) => {
        const text = searchable(model).join(" ").toLowerCase();
        return words.every((word) => text.includes(word));
    });
    expect(expected.map((model) => model.name)).toContain(probe.name);

    for (const value of [probe.name, probe.name.toUpperCase()]) {
        const searched = await fetchList(`query=${encodeURIComponent(value)}`);
        expect(searched.map((model) => model.name).sort()).toEqual(
            expected.map((model) => model.name).sort(),
        );
    }
});

test("combines query words with AND semantics across fields", async () => {
    const all = await fetchList("");
    const probe = all.find(
        (model) => searchable(model).join(" ").trim().split(/\s+/).length > 1,
    );
    expect(probe).toBeDefined();
    if (!probe) return;

    // Words may come from different fields, so they do not have to sit next to
    // each other; they only have to both appear in the entry.
    const words = searchable(probe).join(" ").trim().split(/\s+/);
    const first = words[0];
    const last = words[words.length - 1];
    expect(first).not.toEqual(last);

    const both = await fetchList(
        `query=${encodeURIComponent(`${first} ${last}`)}`,
    );
    expect(both.map((model) => model.name)).toContain(probe.name);

    // One impossible word drops the whole match, so the words are ANDed.
    expect(
        await fetchList(
            `query=${encodeURIComponent(`${first} zzz-no-such-word`)}`,
        ),
    ).toEqual([]);
});

test("combines capabilities with AND semantics", async () => {
    const all = await fetchList("");
    const capabilities = [
        ...new Set(all.flatMap((model) => model.capabilities)),
    ];
    expect(capabilities.length).toBeGreaterThan(1);
    const first = capabilities[0];
    const second = capabilities[1];
    if (!first || !second) return;

    const single = await fetchList(`capabilities=${first}`);
    expect(single.length).toBeGreaterThan(0);
    expect(single.every((model) => model.capabilities.includes(first))).toBe(
        true,
    );

    // Both a pipe and a comma separate values, and every returned model must
    // declare every requested capability.
    for (const separator of ["|", ","]) {
        const both = await fetchList(
            `capabilities=${first}${separator}${second}`,
        );
        expect(
            both.every(
                (model) =>
                    model.capabilities.includes(first) &&
                    model.capabilities.includes(second),
            ),
        ).toBe(true);
    }

    // Unknown capability names are rejected instead of silently matching
    // nothing.
    expect((await fetchWorker("/models?capabilities=nope")).status).toBe(400);
});

test("filters by agent status", async () => {
    const all = await fetchList("");
    const agents = await fetchList("agent=true");
    const models = await fetchList("agent=false");

    // The two halves partition the unfiltered list, so an ignored or inverted
    // filter fails here.
    expect(agents.every((model) => model.agent === true)).toBe(true);
    expect(models.every((model) => !model.agent)).toBe(true);
    expect([...agents, ...models].map((model) => model.name).sort()).toEqual(
        all.map((model) => model.name).sort(),
    );

    expect((await fetchList("agent=1")).map((model) => model.name)).toEqual(
        agents.map((model) => model.name),
    );
    expect((await fetchWorker("/models?agent=maybe")).status).toBe(400);
});

test("applies limit after every other filter", async () => {
    const all = await fetchList("");
    const three = await fetchList("limit=3");
    expect(three).toEqual(all.slice(0, 3));

    // Limit only ever truncates; it never pads an empty result.
    expect(await fetchList("query=zzz-no-such-model&limit=3")).toEqual([]);
    expect((await fetchWorker("/models?limit=0")).status).toBe(400);
    expect((await fetchWorker("/models?limit=501")).status).toBe(400);
    expect((await fetchWorker("/models?limit=abc")).status).toBe(400);
});

test("combines query, capabilities, and limit", async () => {
    const all = await fetchList("");
    const capability = all.find(
        (model) => model.capabilities.length > 0,
    )?.capabilities[0];
    expect(capability).toBeDefined();
    if (!capability) return;

    const combined = await fetchList(
        `query=${encodeURIComponent(all[0].name)}&capabilities=${capability}&limit=1`,
    );
    expect(combined.length).toBeLessThanOrEqual(1);
    for (const model of combined) {
        expect(model.capabilities).toContain(capability);
    }
});

test("applies the discovery filters to every model-list route", async () => {
    for (const path of [
        "/models",
        "/text/models",
        "/image/models",
        "/video/models",
        "/audio/models",
        "/embeddings/models",
        "/3d/models",
    ]) {
        const unfiltered = await list(`${path}?reliability=all`);
        const limited = await list(`${path}?reliability=all&limit=2`);
        expect(limited.length, path).toBe(Math.min(2, unfiltered.length));
        expect(limited.map((model) => model.name), path).toEqual(
            unfiltered.slice(0, 2).map((model) => model.name),
        );
    }

    // The query filter runs on category routes too.
    const text = await list("/text/models?reliability=all");
    const probe = text[0];
    const searched = await list(
        `/text/models?reliability=all&query=${encodeURIComponent(probe.name)}`,
    );
    expect(searched.map((model) => model.name)).toContain(probe.name);
    expect(
        searched.every((model) =>
            searchable(model)
                .join(" ")
                .toLowerCase()
                .includes(probe.name.toLowerCase()),
        ),
    ).toBe(true);

    const allOpenAi = (await (
        await fetchWorker("/v1/models?reliability=all")
    ).json()) as { data: { id: string }[] };
    const openai = await fetchWorker("/v1/models?reliability=all&limit=2");
    expect(openai.status).toBe(200);
    const data = ((await openai.json()) as { data: { id: string }[] }).data;
    expect(data.length).toBe(Math.min(2, allOpenAi.data.length));
    expect(data.map((model) => model.id)).toEqual(
        allOpenAi.data.slice(0, 2).map((model) => model.id),
    );
    expect((await fetchWorker("/v1/models?limit=0")).status).toBe(400);
});

test("keeps key permissions ahead of the limit", async ({
    restrictedApiKey,
}) => {
    const response = await fetchWorker(
        "/text/models?reliability=all&agent=false&limit=500",
        { headers: { Authorization: `Bearer ${restrictedApiKey}` } },
    );
    expect(response.status).toBe(200);
    expect(
        ((await response.json()) as CatalogModel[]).map((model) => model.name),
    ).toEqual([RESTRICTED_TEXT_TEST_MODEL]);
});
