import { env, SELF } from "cloudflare:test";
import { PROMPT_AGENT_BASE_URL_PLACEHOLDER } from "@shared/community-endpoints.ts";
import { communityEndpoint as communityEndpointTable } from "@shared/db/better-auth.ts";
import {
    createTestApiKey,
    createTestUser,
    RESTRICTED_TEST_MODELS,
    test,
} from "@shared/test/fixtures/index.ts";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { resetGenerationModelRegistryCache } from "../src/model-registry.ts";

const db = drizzle(env.DB);

type CatalogEntry = {
    name: string;
    title: string;
    publisher: string;
    description?: string;
    aliases?: string[];
    capabilities?: string[];
    agent?: boolean;
};

async function fetchCatalog(
    path: string,
    init?: RequestInit,
): Promise<CatalogEntry[]> {
    const response = await SELF.fetch(
        new Request(`https://gen.pollinations.ai${path}`, init),
    );
    expect(response.status).toBe(200);
    return (await response.json()) as CatalogEntry[];
}

const namesOf = (entries: CatalogEntry[]) => entries.map((entry) => entry.name);

// The catalog text an agent searches, mirroring what `query` covers.
function searchableText(entry: CatalogEntry): string {
    return [
        entry.name,
        ...(entry.aliases ?? []),
        entry.title,
        entry.description,
        entry.publisher,
    ]
        .filter(Boolean)
        .join("\n")
        .toLowerCase();
}

// Minimal community listing rows: everything else falls back to column
// defaults, and `payload` is what puts the row in the catalog.
async function insertAgent(
    ownerGithubUsername: string,
    name: string,
    visibility: "public" | "private",
) {
    const id = crypto.randomUUID();
    const ownerUserId = await createTestUser({
        githubUsername: ownerGithubUsername,
    });
    await db.insert(communityEndpointTable).values({
        id,
        ownerUserId,
        name,
        title: name,
        description: `Test agent for ${name}`,
        type: "prompt_agent",
        visibility,
        baseUrl: PROMPT_AGENT_BASE_URL_PLACEHOLDER,
        upstreamModel: id,
        payload: JSON.stringify({
            systemPrompt: "Answer questions briefly.",
            baseModel: "openai",
            mcpServers: [],
        }),
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    await resetGenerationModelRegistryCache(env);
    return { id: `community/${ownerGithubUsername}/${name}`, ownerUserId };
}

test("query keeps every model whose catalog text matches, case-insensitively", async () => {
    const catalog = await fetchCatalog("/models");
    const term = catalog[0].publisher.toUpperCase();
    const needle = term.toLowerCase();
    const expected = catalog.filter((entry) =>
        searchableText(entry).includes(needle),
    );

    const found = await fetchCatalog(
        `/models?query=${encodeURIComponent(term)}`,
    );

    expect(expected.length).toBeGreaterThan(0);
    expect(found.every((entry) => searchableText(entry).includes(needle))).toBe(
        true,
    );
    expect(namesOf(found)).toEqual(namesOf(expected));
});

test("capabilities requires every requested capability and accepts either separator", async () => {
    const catalog = await fetchCatalog("/models");
    const expected = catalog.filter((entry) =>
        ["tool_calling", "reasoning"].every((capability) =>
            entry.capabilities?.includes(capability),
        ),
    );
    const comma = await fetchCatalog(
        "/models?capabilities=tool_calling,reasoning",
    );
    const pipe = await fetchCatalog(
        "/models?capabilities=tool_calling|reasoning",
    );
    const toolCalling = await fetchCatalog("/models?capabilities=tool_calling");

    expect(toolCalling.length).toBeGreaterThan(0);
    expect(namesOf(comma)).toEqual(namesOf(expected));
    expect(namesOf(pipe)).toEqual(namesOf(comma));
    expect(
        comma.every(
            (entry) =>
                entry.capabilities?.includes("tool_calling") &&
                entry.capabilities?.includes("reasoning"),
        ),
    ).toBe(true);
});

test("source, capabilities, query and limit combine instead of replacing each other", async () => {
    const official = await fetchCatalog("/models?source=official");
    const target = official.find((entry) =>
        entry.capabilities?.includes("tool_calling"),
    );
    if (!target) throw new Error("Test registry has no tool-calling model");
    const term = target.name.split("/").at(-1) ?? target.name;
    const needle = term.toLowerCase();
    const expected = official.filter(
        (entry) =>
            entry.capabilities?.includes("tool_calling") &&
            searchableText(entry).includes(needle),
    );

    const combined = await fetchCatalog(
        `/models?source=official&capabilities=tool_calling` +
            `&query=${encodeURIComponent(term)}&limit=2`,
    );

    expect(namesOf(expected)).toContain(target.name);
    expect(namesOf(combined)).toEqual(namesOf(expected).slice(0, 2));
});

test("limit trims the catalog after every other filter", async () => {
    const catalog = await fetchCatalog("/models");
    expect(catalog.length).toBeGreaterThan(3);

    const limited = await fetchCatalog("/models?limit=3");

    expect(namesOf(limited)).toEqual(namesOf(catalog).slice(0, 3));
});

test("key permissions are applied before limit trims the catalog", async ({
    restrictedApiKey,
}) => {
    const headers = { Authorization: `Bearer ${restrictedApiKey}` };
    const allowed = new Set<string>(RESTRICTED_TEST_MODELS);
    const catalog = await fetchCatalog("/models?limit=50", { headers });

    expect(catalog.length).toBeGreaterThan(0);
    expect(catalog.every((entry) => allowed.has(entry.name))).toBe(true);

    const single = await fetchCatalog("/models?limit=1", { headers });
    expect(namesOf(single)).toEqual(namesOf(catalog).slice(0, 1));
});

test("agent filter splits agents from the rest of the catalog", async () => {
    const { id: agentId } = await insertAgent(
        `filter-agent-owner-${crypto.randomUUID()}`,
        "researcher",
        "public",
    );

    const catalog = await fetchCatalog("/models");
    const agents = await fetchCatalog("/models?agent=true");
    const nonAgents = await fetchCatalog("/models?agent=false");

    expect(agents.length).toBeGreaterThan(0);
    expect(namesOf(agents)).toContain(agentId);
    expect(agents.every((entry) => entry.agent === true)).toBe(true);
    expect(nonAgents.some((entry) => entry.agent === true)).toBe(false);
    expect(nonAgents.length).toBeGreaterThan(0);
    expect(new Set([...namesOf(agents), ...namesOf(nonAgents)])).toEqual(
        new Set(namesOf(catalog)),
    );
});

test("private community models stay visible to their owner under every filter", async () => {
    const username = `private-agent-owner-${crypto.randomUUID()}`;
    const { id: agentId, ownerUserId } = await insertAgent(
        username,
        "note-keeper",
        "private",
    );
    const { key } = await createTestApiKey({ userId: ownerUserId });
    const headers = { Authorization: `Bearer ${key}` };

    expect(namesOf(await fetchCatalog("/models?agent=true"))).not.toContain(
        agentId,
    );
    expect(
        namesOf(await fetchCatalog("/models?query=note-keeper")),
    ).not.toContain(agentId);

    expect(
        namesOf(await fetchCatalog("/models?agent=true", { headers })),
    ).toContain(agentId);
    expect(
        namesOf(await fetchCatalog("/models?query=note-keeper", { headers })),
    ).toEqual([agentId]);
});
