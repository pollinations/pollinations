import { SELF } from "cloudflare:test";
import { createTestApiKey, test } from "@shared/test/fixtures/index.ts";
import { expect } from "vitest";

type CatalogModel = {
    name: string;
    aliases?: string[];
    title?: string;
    description?: string;
    publisher?: string;
    capabilities?: string[];
    agent?: boolean;
};

async function catalog(path: string, init: RequestInit = {}) {
    const response = await SELF.fetch(
        new Request(`https://gen.pollinations.ai${path}`, init),
    );
    expect(response.status).toBe(200);
    return (await response.json()) as CatalogModel[];
}

const searchText = (model: CatalogModel) =>
    [
        model.name,
        ...(model.aliases ?? []),
        model.title,
        model.description,
        model.publisher,
    ]
        .filter(Boolean)
        .join("\n")
        .toLowerCase();

const names = (models: CatalogModel[]) => models.map((model) => model.name);

test("query matches canonical text and keeps catalog order", async () => {
    const all = await catalog("/models?reliability=all");
    const term = "flux";
    const expected = all.filter((model) => searchText(model).includes(term));
    expect(expected.length).toBeGreaterThan(0);

    const filtered = await catalog(`/models?reliability=all&query=${term}`);
    expect(names(filtered)).toEqual(names(expected));
    expect(filtered.every((model) => searchText(model).includes(term))).toBe(
        true,
    );
});

test("query matches aliases, title, description and publisher", async () => {
    const all = await catalog("/models?reliability=all");
    const sample = all.find((model) => (model.publisher ?? "").length > 3);
    if (!sample) throw new Error("expected a catalog model with a publisher");
    const token = (sample.publisher ?? "").trim().split(/\s+/)[0].toLowerCase();

    const filtered = await catalog(
        `/models?reliability=all&query=${encodeURIComponent(token)}`,
    );
    // Publisher matches must be included; every hit still matches some field.
    expect(names(filtered)).toContain(sample.name);
    expect(filtered.every((model) => searchText(model).includes(token))).toBe(
        true,
    );
});

test("multiple capabilities combine with AND", async () => {
    const all = await catalog("/models?reliability=all");
    const required = ["tool_calling", "reasoning"];
    const expected = all.filter((model) =>
        required.every((capability) =>
            (model.capabilities ?? []).includes(capability),
        ),
    );
    expect(expected.length).toBeGreaterThan(0);

    const filtered = await catalog(
        `/models?reliability=all&capabilities=${required.join("|")}`,
    );
    expect(names(filtered)).toEqual(names(expected));

    // A single capability is a superset of the AND result.
    const single = await catalog(
        "/models?reliability=all&capabilities=reasoning",
    );
    expect(single.length).toBeGreaterThanOrEqual(filtered.length);
});

test("agent filter returns only agents or only non-agents", async () => {
    const all = await catalog("/models?reliability=all");

    const agents = await catalog("/models?reliability=all&agent=true");
    expect(names(agents)).toEqual(
        names(all.filter((model) => model.agent === true)),
    );
    expect(agents.every((model) => model.agent === true)).toBe(true);

    const nonAgents = await catalog("/models?reliability=all&agent=false");
    expect(names(nonAgents)).toEqual(
        names(all.filter((model) => model.agent !== true)),
    );
    expect(nonAgents.every((model) => model.agent !== true)).toBe(true);
});

test("limit is applied after filters and preserves catalog order", async () => {
    const all = await catalog("/models?reliability=all&query=a");
    expect(all.length).toBeGreaterThan(1);
    const limited = await catalog("/models?reliability=all&query=a&limit=2");
    expect(names(limited)).toEqual(names(all.slice(0, 2)));
});

test("query cannot reveal models outside API key permissions", async () => {
    const allowed = "openai/gpt-5.4-nano";
    const { key } = await createTestApiKey({
        allowedModels: [allowed],
        user: { packBalance: 100 },
    });
    const headers = { Authorization: `Bearer ${key}` };

    const permitted = await catalog(
        `/models?reliability=all&query=${encodeURIComponent(allowed)}`,
        { headers },
    );
    expect(names(permitted)).toEqual([allowed]);

    const denied = await catalog("/models?reliability=all&query=flux", {
        headers,
    });
    expect(denied).toEqual([]);
});

test("combined filters narrow to the expected intersection", async () => {
    const all = await catalog("/models?reliability=all");
    const expected = all
        .filter((model) => model.agent !== true)
        .filter((model) => (model.capabilities ?? []).includes("tool_calling"))
        .filter((model) => searchText(model).includes("gpt"))
        .slice(0, 3);
    expect(expected.length).toBeGreaterThan(0);

    const filtered = await catalog(
        "/models?reliability=all&agent=false&capabilities=tool_calling&query=gpt&limit=3",
    );
    expect(names(filtered)).toEqual(names(expected));
});
