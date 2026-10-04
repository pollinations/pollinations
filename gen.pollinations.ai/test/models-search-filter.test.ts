import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { PROMPT_AGENT_BASE_URL_PLACEHOLDER } from "@shared/community-endpoints.ts";
import { communityEndpoint } from "@shared/db/better-auth.ts";
import type { ModelHealthRow } from "@shared/model-health.ts";
import { DEFAULT_TEXT_MODEL } from "@shared/registry/text.ts";
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
    publisher: string;
    title: string;
    description?: string;
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

async function list(path: string, init: RequestInit = {}) {
    const response = await fetchWorker(path, init);
    expect(response.status, path).toBe(200);
    return (await response.json()) as ListedModel[];
}

// The health feed is external; an empty row set keeps every model "unknown"
// without changing which models the discovery filters select.
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
                return Response.json({ data: rows });
            }
            return originalFetch(input, init);
        });
}

const catalogText = (model: ListedModel) =>
    [
        model.name,
        ...(model.aliases ?? []),
        model.title,
        model.description ?? "",
        model.publisher,
    ]
        .join("\n")
        .toLowerCase();

const names = (models: ListedModel[]) => models.map((model) => model.name);

beforeEach(() => {
    mockCatalogHealth([]);
});

afterEach(async () => {
    await resetGenerationModelRegistryCache(env);
    vi.restoreAllMocks();
});

test("query searches canonical name, aliases, title, description and publisher", async () => {
    const all = await list("/models?reliability=all");
    expect(all.length).toBeGreaterThan(10);

    // A description-only word proves the search reaches past name and title.
    const probe = all.find((model) => {
        const outsideDescription = [
            model.name,
            ...(model.aliases ?? []),
            model.title,
        ]
            .join(" ")
            .toLowerCase();
        return (model.description ?? "")
            .toLowerCase()
            .split(/\s+/)
            .some(
                (word) =>
                    word.length >= 6 &&
                    !outsideDescription.includes(word) &&
                    all.filter((other) => catalogText(other).includes(word))
                        .length <= 3,
            );
    });
    expect(
        probe,
        "catalog needs a model with description-only text",
    ).toBeDefined();
    const word = (probe?.description ?? "")
        .toLowerCase()
        .split(/\s+/)
        .find(
            (candidate) =>
                candidate.length >= 6 &&
                ![probe?.name, ...(probe?.aliases ?? []), probe?.title]
                    .join(" ")
                    .toLowerCase()
                    .includes(candidate) &&
                all.filter((other) => catalogText(other).includes(candidate))
                    .length <= 3,
        );
    expect(word).toBeDefined();

    const hits = await list(
        `/models?reliability=all&query=${encodeURIComponent(word ?? "")}`,
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThan(all.length);
    expect(names(hits)).toContain(probe?.name);
    // Every hit is explained by the documented searchable fields.
    for (const model of hits) expect(catalogText(model)).toContain(word ?? "");

    // Publisher text narrows the catalog too.
    const publisher = probe?.publisher as string;
    const byPublisher = await list(
        `/models?reliability=all&query=${encodeURIComponent(publisher)}`,
    );
    expect(byPublisher.length).toBeGreaterThan(0);
    for (const model of byPublisher)
        expect(catalogText(model)).toContain(publisher.toLowerCase());

    // Multiple words combine with AND semantics.
    const described = all.find((model) => model.description?.includes(" "));
    expect(described).toBeDefined();
    const [first, second] = (described?.description ?? "a b").split(/\s+/);
    const combined = await list(
        `/models?reliability=all&query=${encodeURIComponent(`${first} ${second}`)}`,
    );
    expect(names(combined)).toContain(described?.name);

    const impossible = await list(
        "/models?reliability=all&query=zzzznotarealword",
    );
    expect(impossible).toEqual([]);
});

test("capabilities require every listed capability, regardless of spelling", async () => {
    const all = await list("/models?reliability=all");
    const pool = [...new Set(all.flatMap((model) => model.capabilities ?? []))];
    expect(pool.length).toBeGreaterThan(1);

    // Pick a model that carries two capabilities so the AND check is
    // meaningful, plus one that carries only the first.
    const multi = all.find((model) => (model.capabilities ?? []).length >= 2);
    expect(multi, "catalog needs a model with two capabilities").toBeDefined();
    const [first, second] = multi?.capabilities ?? [];
    const firstUsers = all.filter((model) =>
        (model.capabilities ?? []).includes(first),
    );
    const secondOnly = firstUsers.filter(
        (model) => !(model.capabilities ?? []).includes(second),
    );
    expect(secondOnly.length).toBeGreaterThan(0);

    const both = await list(
        `/models?reliability=all&capabilities=${encodeURIComponent(`${first},${second}`)}`,
    );
    expect(names(both)).toEqual(
        names(
            all.filter(
                (model) =>
                    (model.capabilities ?? []).includes(first) &&
                    (model.capabilities ?? []).includes(second),
            ),
        ),
    );
    expect(names(both)).not.toContain(secondOnly[0].name);

    // Case, spaces and `-`/`_` differences do not change the match.
    const spelledDifferently = await list(
        `/models?reliability=all&capabilities=${encodeURIComponent(
            `${first.toUpperCase().replaceAll("_", "-")}`,
        )}`,
    );
    expect(names(spelledDifferently)).toEqual(
        names(
            all.filter((model) => (model.capabilities ?? []).includes(first)),
        ),
    );
});

test("agent=true keeps only agents and agent=false drops them", async () => {
    // Agents are community listings Gen runs itself (type !== "proxy"), so
    // the fixture registers one public prompt agent to filter over.
    const owner = `agent-${crypto.randomUUID().slice(0, 8)}`;
    const ownerUserId = await createTestUser({ githubUsername: owner });
    const name = "catalogprobe";
    const rowId = crypto.randomUUID();
    await drizzle(env.DB)
        .insert(communityEndpoint)
        .values({
            id: rowId,
            ownerUserId,
            name,
            title: name,
            description: "Prompt agent used by the discovery filter tests",
            type: "prompt_agent" as const,
            visibility: "public" as const,
            baseUrl: PROMPT_AGENT_BASE_URL_PLACEHOLDER,
            upstreamModel: rowId,
            payload: JSON.stringify({
                systemPrompt: "Test",
                baseModel: DEFAULT_TEXT_MODEL,
                mcpServers: [],
            }),
            hiddenAt: null,
            hiddenBy: null,
        });
    await resetGenerationModelRegistryCache(env);

    const agentId = `community/${owner}/${name}`;
    const all = await list("/models?reliability=all");
    const agents = all.filter((model) => model.agent === true);
    expect(names(agents)).toContain(agentId);

    const onlyAgents = await list("/models?reliability=all&agent=true");
    expect(onlyAgents.every((model) => model.agent === true)).toBe(true);
    expect(names(onlyAgents).sort()).toEqual(names(agents).sort());

    const withoutAgents = await list("/models?reliability=all&agent=false");
    expect(withoutAgents.some((model) => model.agent === true)).toBe(false);
    expect(names(withoutAgents)).toEqual(
        names(all.filter((model) => model.agent !== true)),
    );
});

test("limit trims last, so ordering and the other filters still decide", async () => {
    const all = await list("/models?reliability=all");

    const limited = await list("/models?reliability=all&limit=3");
    expect(names(limited)).toEqual(names(all.slice(0, 3)));

    const publisher = all[0].publisher;
    const query = `/models?reliability=all&query=${encodeURIComponent(publisher)}`;
    const unrestricted = await list(query);
    expect(unrestricted.length).toBeGreaterThan(3);
    const trimmed = await list(`${query}&limit=3`);
    expect(names(trimmed)).toEqual(names(unrestricted.slice(0, 3)));

    // Combined filters: every survivor satisfies all of them.
    const capability = (unrestricted.find(
        (model) => (model.capabilities ?? []).length,
    )?.capabilities ?? ["tool_calling"])[0];
    const combined = await list(
        `${query}&capabilities=${encodeURIComponent(capability)}&agent=false&limit=2`,
    );
    expect(combined.length).toBeLessThanOrEqual(2);
    for (const model of combined) {
        expect(catalogText(model)).toContain(publisher.toLowerCase());
        expect(model.capabilities ?? []).toContain(capability);
        expect(model.agent).not.toBe(true);
    }
});

test("query and limit do not bypass API key model permissions", async ({
    restrictedApiKey,
}) => {
    const restricted = await list("/models?reliability=all&query=gpt", {
        headers: { Authorization: `Bearer ${restrictedApiKey}` },
    });
    expect(names(restricted)).toEqual([RESTRICTED_TEXT_TEST_MODEL]);
});

test("owner-private community models stay discoverable under the new filters", async () => {
    const owner = `search-${crypto.randomUUID().slice(0, 8)}`;
    const ownerUserId = await createTestUser({ githubUsername: owner });
    const { key: ownerKey } = await createTestApiKey({ userId: ownerUserId });
    const name = "hiddenneedle";
    await drizzle(env.DB)
        .insert(communityEndpoint)
        .values({
            id: crypto.randomUUID(),
            ownerUserId,
            name,
            title: name,
            type: "proxy" as const,
            baseUrl: "https://provider.example/v1/chat/completions",
            upstreamModel: "test",
            visibility: "private" as const,
            hiddenAt: null,
            hiddenBy: null,
            payload: JSON.stringify({
                bearerTokenCiphertext:
                    "test-placeholder-not-used-for-generation",
                api: "chat_completions",
                modality: "text",
                imagePricing: "request",
                inputModalities: ["text"],
                perUserRpm: null,
                fallbacks: [],
                prices: {},
            }),
        });
    await resetGenerationModelRegistryCache(env);

    const id = `community/${owner}/${name}`;
    const ownerList = await list(
        "/models?reliability=all&query=hiddenneedle&agent=false&limit=50",
        { headers: { Authorization: `Bearer ${ownerKey}` } },
    );
    expect(names(ownerList)).toContain(id);

    const anonymousList = await list(
        "/models?reliability=all&query=hiddenneedle",
    );
    expect(names(anonymousList)).not.toContain(id);
});

test("category and OpenAI-compatible lists expose the same filters", async () => {
    const textAll = await list("/text/models?reliability=all");
    const textLimited = await list(
        "/text/models?reliability=all&query=llm&limit=2",
    );
    // `llm` may legitimately return nothing; the guarantee is the cap and that
    // category routes honour it exactly like /models does.
    expect(textLimited.length).toBeLessThanOrEqual(2);
    const textHardCap = await list("/text/models?reliability=all&limit=2");
    expect(names(textHardCap)).toEqual(names(textAll.slice(0, 2)));

    const word = (textAll[0].description ?? "model")
        .split(/\s+/)
        .find((candidate) => candidate.length >= 5);
    const searchWord = word ?? textAll[0].title;
    const textHits = await list(
        `/text/models?reliability=all&query=${encodeURIComponent(searchWord)}&limit=4`,
    );
    expect(textHits.length).toBeLessThanOrEqual(4);
    for (const model of textHits)
        expect(catalogText(model)).toContain(searchWord.toLowerCase());

    const v1 = await fetchWorker(
        `/v1/models?reliability=all&query=${encodeURIComponent(searchWord)}&limit=4`,
    );
    expect(v1.status).toBe(200);
    const body = (await v1.json()) as {
        object: string;
        data: { id: string; title: string }[];
    };
    expect(body.object).toBe("list");
    expect(body.data.length).toBeLessThanOrEqual(4);

    const allHits = await list(
        `/models?reliability=all&query=${encodeURIComponent(searchWord)}&limit=4`,
    );
    expect(body.data.length).toBe(allHits.length);
    expect(body.data.map((entry) => entry.id)).toEqual(names(allHits));
});
