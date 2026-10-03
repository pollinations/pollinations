import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { PROMPT_AGENT_BASE_URL_PLACEHOLDER } from "@shared/community-endpoints.ts";
import { communityEndpoint } from "@shared/db/better-auth.ts";
import type { ModelHealthRow } from "@shared/model-health.ts";
import {
    createTestApiKey,
    createTestUser,
    RESTRICTED_TEXT_TEST_MODEL,
    test,
} from "@shared/test/fixtures/index.ts";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { resetGenerationModelRegistryCache } from "../src/model-registry.ts";

type ListedModel = {
    name: string;
    aliases?: string[];
    title?: string;
    description?: string;
    publisher?: string;
    capabilities?: string[];
    agent?: boolean;
};

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

async function listModels(
    path: string,
    headers: Record<string, string> = {},
): Promise<ListedModel[]> {
    const response = await fetchWorker(path, { headers });
    expect(response.status).toBe(200);
    const body = (await response.json()) as
        | ListedModel[]
        | { data: { id: string }[] };
    // /v1/models answers in the OpenAI list shape.
    return Array.isArray(body)
        ? body
        : body.data.map((entry) => ({ name: entry.id }) as ListedModel);
}

beforeEach(() => {
    mockCatalogHealth([]);
});

afterEach(async () => {
    await resetGenerationModelRegistryCache(env);
    vi.restoreAllMocks();
});

function mockCatalogHealth(
    rows: ModelHealthRow[],
    status = 200,
    officialRows = rows,
) {
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
                return Response.json(
                    {
                        data:
                            url.pathname ===
                            "/v0/pipes/model_catalog_health.json"
                                ? rows
                                : officialRows,
                    },
                    { status },
                );
            }
            return originalFetch(input, init);
        });
}

function searchableText(model: ListedModel): string {
    return [
        model.name,
        ...(model.aliases ?? []),
        model.title,
        model.description,
        model.publisher,
    ]
        .filter(Boolean)
        .join("\n")
        .toLowerCase();
}

test("query matches catalog text case-insensitively with AND token semantics", async () => {
    const all = await listModels("/models");
    const anchor = "openai/gpt-5.4-nano";
    expect(all.some((model) => model.name === anchor)).toBe(true);

    const byName = await listModels("/models?query=gpt-5.4-nano");
    expect(byName.some((model) => model.name === anchor)).toBe(true);
    expect(byName.length).toBeLessThan(all.length);
    for (const model of byName) {
        expect(searchableText(model)).toContain("gpt-5.4-nano");
    }

    // Case-insensitivity returns the identical set.
    const upper = await listModels("/models?query=GPT-5.4-NANO");
    expect(upper.map((model) => model.name)).toEqual(
        byName.map((model) => model.name),
    );

    // Multiple tokens must ALL match, independently of where they appear.
    const multi = await listModels("/models?query=openai+nano");
    expect(multi.some((model) => model.name === anchor)).toBe(true);
    for (const model of multi) {
        const text = searchableText(model);
        expect(text).toContain("openai");
        expect(text).toContain("nano");
    }

    // Publisher text alone must be enough to match: pick a model whose
    // canonical name does NOT contain its publisher token.
    const byPublisherModel = all.find((model) => {
        const publisher = model.publisher?.trim().toLowerCase();
        return (
            publisher &&
            publisher.length > 1 &&
            !model.name.toLowerCase().includes(publisher)
        );
    });
    expect(byPublisherModel).toBeDefined();
    const publisherToken = byPublisherModel?.publisher
        ?.trim()
        .toLowerCase() as string;
    const byPublisher = await listModels(`/models?query=${publisherToken}`);
    expect(
        byPublisher.some((model) => model.name === byPublisherModel?.name),
    ).toBe(true);

    // A title/alias-only token (not present in the canonical name) matches.
    const aliased = all.find(
        (model) =>
            (model.aliases ?? []).length > 0 ||
            (model.title &&
                !model.name.toLowerCase().includes(model.title.toLowerCase())),
    );
    expect(aliased).toBeDefined();
    const tokenSource = (aliased?.aliases?.[0] ?? aliased?.title ?? "")
        .split(/\s+/)[0]
        .toLowerCase();
    expect(tokenSource.length).toBeGreaterThan(1);
    const byAlias = await listModels(`/models?query=${tokenSource}`);
    expect(byAlias.some((model) => model.name === aliased?.name)).toBe(true);

    // Blank query is ignored.
    const blank = await listModels("/models?query=+");
    expect(blank.length).toBe(all.length);
});

test("capabilities use AND semantics with lenient list parsing", async () => {
    const all = await listModels("/models");
    const reasoningOnly = all.filter(
        (model) =>
            model.capabilities?.includes("reasoning") &&
            !model.capabilities?.includes("tool_calling"),
    );
    const both = await listModels(
        "/models?capabilities=reasoning,tool_calling",
    );
    expect(both.length).toBeGreaterThan(0);
    expect(both.length).toBeLessThan(all.length);
    for (const model of both) {
        expect(model.capabilities).toContain("reasoning");
        expect(model.capabilities).toContain("tool_calling");
    }
    for (const model of reasoningOnly) {
        expect(both.some((kept) => kept.name === model.name)).toBe(false);
    }

    // Whitespace, duplicates and trailing commas collapse to the same filter.
    const messy = await listModels(
        "/models?capabilities=+reasoning+,reasoning,",
    );
    expect(messy.map((model) => model.name)).toEqual(
        (await listModels("/models?capabilities=reasoning")).map(
            (model) => model.name,
        ),
    );

    // Unknown capabilities are rejected.
    const bad = await fetchWorker("/models?capabilities=bogus");
    expect(bad.status).toBe(400);
});

test("limit truncates last and preserves catalog order", async () => {
    const all = await listModels("/models");
    const limited = await listModels("/models?limit=3");
    expect(limited.map((model) => model.name)).toEqual(
        all.slice(0, 3).map((model) => model.name),
    );
    for (const invalid of ["0", "-1", "1.5", "abc", "501"]) {
        const response = await fetchWorker(`/models?limit=${invalid}`);
        expect(response.status, `limit=${invalid}`).toBe(400);
    }
});

test("agent filter includes, excludes, and defaults to both", async () => {
    const owner = `agent-${crypto.randomUUID().slice(0, 8)}`;
    const ownerUserId = await createTestUser({ githubUsername: owner });
    const { key: ownerKey } = await createTestApiKey({ userId: ownerUserId });
    // The prompt_agent CHECK constraint requires upstream_model = id.
    const insert = (name: string, visibility: "public" | "private") => {
        const id = crypto.randomUUID();
        return drizzle(env.DB)
            .insert(communityEndpoint)
            .values({
                id,
                ownerUserId,
                name,
                title: name,
                type: "prompt_agent" as const,
                baseUrl: PROMPT_AGENT_BASE_URL_PLACEHOLDER,
                upstreamModel: id,
                visibility,
                payload: JSON.stringify({
                    systemPrompt: "You are a test agent.",
                    baseModel: "openai",
                    mcpServers: [],
                }),
            });
    };
    await insert("visible-agent", "public");
    await insert("hidden-agent", "private");
    await resetGenerationModelRegistryCache(env);
    const publicAgent = `community/${owner}/visible-agent`;
    const privateAgent = `community/${owner}/hidden-agent`;

    const agentsOnly = await listModels("/models?agent=true&query=agent-");
    const agentNames = agentsOnly.map((model) => model.name);
    expect(agentNames).toContain(publicAgent);
    expect(agentNames).not.toContain(privateAgent);
    expect(agentNames).not.toContain("openai/gpt-5.4-nano");

    const noAgents = await listModels("/models?agent=false&query=agent-");
    expect(noAgents.some((model) => model.name === publicAgent)).toBe(false);

    // 1/0 aliases behave like true/false.
    for (const [param, included] of [
        ["1", true],
        ["0", false],
    ] as const) {
        const models = await listModels(`/models?agent=${param}&query=agent-`);
        expect(models.some((model) => model.name === publicAgent)).toBe(
            included,
        );
    }

    // Omitted agent lists both agents and ordinary models.
    const both = await listModels("/models?query=agent-");
    expect(both.some((model) => model.name === publicAgent)).toBe(true);

    // The owner sees their private agent (visibility filtering precedes any
    // truncation; both agents fit under limit=2).
    const ownerAgents = await listModels(
        "/models?agent=true&query=agent-&limit=2",
        {
            Authorization: `Bearer ${ownerKey}`,
        },
    );
    const ownerNames = ownerAgents.map((model) => model.name);
    expect(ownerNames).toContain(publicAgent);
    expect(ownerNames).toContain(privateAgent);
});

test("invalid filter values are rejected on every list route", async () => {
    const routes = [
        "/models",
        "/v1/models",
        "/text/models",
        "/image/models",
        "/video/models",
        "/audio/models",
        "/embeddings/models",
        "/3d/models",
    ];
    for (const route of routes) {
        for (const params of [
            "limit=0",
            "limit=501",
            "capabilities=bogus",
            "agent=maybe",
        ]) {
            const response = await fetchWorker(`${route}?${params}`);
            expect(response.status, `${route}?${params}`).toBe(400);
        }
    }
});

test("permission filtering applies before limit", async () => {
    const { key } = await createTestApiKey({
        allowedModels: [RESTRICTED_TEXT_TEST_MODEL],
        user: { packBalance: 100 },
    });
    const headers = { Authorization: `Bearer ${key}` };
    // Where does the permitted model sit in the unfiltered ranking?
    const anonymousAll = await listModels("/text/models?query=openai");
    const position = anonymousAll.findIndex(
        (model) => model.name === RESTRICTED_TEXT_TEST_MODEL,
    );
    expect(position).toBeGreaterThanOrEqual(0);
    // Cut the list exactly at the permitted model's position: if limit ran
    // before permissions, the response would hold earlier, disallowed models.
    const cut = Math.max(position, 1);
    const restricted = await listModels(
        `/text/models?query=openai&limit=${cut}`,
        { ...headers },
    );
    expect(restricted.map((model) => model.name)).toEqual([
        RESTRICTED_TEXT_TEST_MODEL,
    ]);
    const anonymous = await listModels("/text/models?query=openai&limit=5");
    expect(anonymous.length).toBeGreaterThan(1);
});

test("reliability filtering applies before limit", async () => {
    const owner = `health-${crypto.randomUUID().slice(0, 8)}`;
    const ownerUserId = await createTestUser({ githubUsername: owner });
    const insert = (name: string) =>
        drizzle(env.DB)
            .insert(communityEndpoint)
            .values({
                id: crypto.randomUUID(),
                ownerUserId,
                name,
                title: name,
                type: "proxy" as const,
                baseUrl: "https://provider.example/v1/chat/completions",
                upstreamModel: "test",
                visibility: "public" as const,
                payload: JSON.stringify({
                    bearerTokenCiphertext: "test-placeholder",
                    api: "chat_completions",
                    modality: "text",
                    imagePricing: "request",
                    inputModalities: ["text"],
                    perUserRpm: null,
                    fallbacks: [],
                    prices: {},
                }),
            });
    // Community entries list alphabetically by name; the unreliable proxy
    // must sort FIRST so a premature limit=1 would keep it and fail below.
    await insert("aaa-unreliable");
    await insert("zzz-reliable");
    await resetGenerationModelRegistryCache(env);
    const failingId = `community/${owner}/aaa-unreliable`;
    const passingId = `community/${owner}/zzz-reliable`;
    mockCatalogHealth(
        [
            {
                model: failingId,
                event_type: "generate.text",
                is_rollup: 1,
                status_2xx: 0,
                errors_5xx: 10,
            },
            {
                model: passingId,
                event_type: "generate.text",
                is_rollup: 1,
                status_2xx: 50,
                errors_5xx: 0,
            },
        ],
        200,
        [],
    );

    const query = `/models?query=${owner}`;
    // Learn the catalog order with every filter off.
    const unfiltered = await listModels(`${query}&reliability=all`);
    expect(unfiltered.map((model) => model.name).sort()).toEqual(
        [failingId, passingId].sort(),
    );
    // The test only detects early truncation if the unreliable entry comes
    // first in catalog order; fail loudly when that premise breaks.
    expect(unfiltered[0]?.name).toBe(failingId);

    // Default reliability drops the failing proxy before the limit cuts.
    const limited = await listModels(`${query}&limit=1`);
    expect(limited.map((model) => model.name)).toEqual([passingId]);
});

test("filters behave identically across list routes", async () => {
    const params = "query=openai&capabilities=reasoning&limit=4";
    const catalog = await listModels(`/models?${params}`);
    const category = await listModels(`/text/models?${params}`);
    const openaiCompat = await listModels(`/v1/models?${params}`);
    const catalogNames = catalog.map((model) => model.name);
    expect(catalogNames.length).toBeGreaterThan(0);
    expect(catalogNames).toEqual(category.map((model) => model.name));
    expect(catalogNames).toEqual(openaiCompat.map((model) => model.name));
    for (const model of catalog) {
        expect(model.capabilities).toContain("reasoning");
    }
    // A category route still applies the same search semantics.
    const images = await listModels("/image/models?query=flux");
    for (const model of images) {
        expect(searchableText(model)).toContain("flux");
    }
});
