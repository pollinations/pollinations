import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker, { setFetchImpl, clearCache } from "./worker.js";

// Outbound fetch is injected, so these tests never hit PokéAPI. CI stays green
// even when the public API is rate limiting.

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient() {
    const client = new Client(
        { name: "pokemon-mcp-worker-test", version: "0.0.1" },
        { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://pokemon-mcp.pollinations.ai"),
        { fetch: localFetch, requestInit: {} },
    );
    await client.connect(transport);
    return client;
}

function jsonResponse(body, status = 200, headers = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json", ...headers },
    });
}

function mon({ id, name, height, weight, stats, types = ["electric"] }) {
    return {
        id,
        name,
        height,
        weight,
        base_experience: 112,
        types: types.map((t) => ({ type: { name: t } })),
        abilities: [{ ability: { name: "static" } }],
        stats: Object.entries(stats).map(([stat, base_stat]) => ({ base_stat, stat: { name: stat } })),
        sprites: { front_default: `https://img/${id}.png` },
    };
}

const PIKACHU = mon({ id: 25, name: "pikachu", height: 4, weight: 60, stats: { hp: 35, attack: 55, speed: 90, defense: 40 } });
const CHARIZARD = mon({ id: 6, name: "charizard", height: 17, weight: 905, stats: { hp: 78, attack: 84, speed: 100, defense: 78 }, types: ["fire", "flying"] });

function mockFetch(handler) {
    clearCache();
    const calls = [];
    setFetchImpl(async (url, init) => {
        calls.push({ url, init });
        return handler(url, init);
    });
    return calls;
}

function byName(map) {
    return async (url) => {
        const name = url.split("/pokemon/")[1];
        const key = decodeURIComponent(name);
        return map[key] ? jsonResponse(map[key]) : new Response("not found", { status: 404 });
    };
}

async function callTool(name, args) {
    const client = await connectClient();
    try {
        const res = await client.callTool({ name, arguments: args });
        return JSON.parse(res.content?.[0]?.text ?? "{}");
    } finally {
        await client.close();
    }
}

test("serves health endpoint", async () => {
    const health = await worker.fetch(new Request("https://pokemon-mcp.pollinations.ai/health"));
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");
});

test("pokemon_lookup returns pikachu with numeric sizes", async (t) => {
    const calls = mockFetch(byName({ pikachu: PIKACHU }));
    t.after(() => { setFetchImpl(null); clearCache(); });

    const out = await callTool("pokemon_lookup", { name: "Pikachu" });
    assert.equal(out.name, "pikachu");
    assert.equal(out.id, 25);
    // height/weight must be numbers, not strings, so callers can compare them
    assert.equal(out.height_m, 0.4);
    assert.equal(out.weight_kg, 6);
    assert.equal(typeof out.height_m, "number");
    assert.equal(out.total_base_stats, 220);
    assert.deepEqual(out.types, ["electric"]);
    assert.equal(calls.length, 1);
});

test("pokemon_lookup accepts a Pokédex id and caches it", async (t) => {
    const calls = mockFetch(byName({ 25: PIKACHU }));
    t.after(() => { setFetchImpl(null); clearCache(); });

    const first = await callTool("pokemon_lookup", { name: "25" });
    const second = await callTool("pokemon_lookup", { name: "25" });
    assert.equal(first.id, 25);
    assert.equal(second.id, 25);
    assert.equal(calls.length, 1, "repeat lookup should come from cache");
});

test("pokemon_lookup reports an unknown name as not_found", async (t) => {
    mockFetch(async () => new Response("not found", { status: 404 }));
    t.after(() => { setFetchImpl(null); clearCache(); });

    const out = await callTool("pokemon_lookup", { name: "notapokemon" });
    assert.equal(out.kind, "not_found");
    assert.equal(out.retryable, false);
    assert.equal(out.httpStatus, 404);
});

test("pokemon_lookup surfaces rate limiting instead of not found", async (t) => {
    const calls = mockFetch(async () => new Response("slow down", { status: 429, headers: { "retry-after": "12" } }));
    t.after(() => { setFetchImpl(null); clearCache(); });

    const out = await callTool("pokemon_lookup", { name: "pikachu" });
    assert.equal(out.kind, "upstream_error");
    assert.equal(out.retryable, true);
    assert.equal(out.httpStatus, 429);
    assert.equal(out.retryAfter, 12);
    assert.equal(calls.length, 2, "429 should be retried once");
});

test("pokemon_lookup rejects junk input without a network call", async (t) => {
    const calls = mockFetch(byName({ pikachu: PIKACHU }));
    t.after(() => { setFetchImpl(null); clearCache(); });

    // "" and 80 chars are rejected by the zod schema before the handler runs,
    // which is also a valid outcome: no network call either way.
    for (const bad of ["", "   ", "pika chu!!", "a".repeat(80)]) {
        const client = await connectClient();
        let text;
        try {
            const res = await client.callTool({ name: "pokemon_lookup", arguments: { name: bad } });
            text = res.content?.[0]?.text ?? "";
        } finally {
            await client.close();
        }
        const rejectedBySchema = /input validation/i.test(text);
        if (rejectedBySchema) continue;
        const out = JSON.parse(text || "{}");
        assert.equal(out.kind, "invalid_input", `expected invalid_input for ${JSON.stringify(bad)}`);
    }
    assert.equal(calls.length, 0);
});

test("pokemon_compare compares real height, weight and stats", async (t) => {
    mockFetch(byName({ pikachu: PIKACHU, charizard: CHARIZARD }));
    t.after(() => { setFetchImpl(null); clearCache(); });

    const out = await callTool("pokemon_compare", { first: "pikachu", second: "charizard" });
    // charizard: height 17 dm = 1.7 m, weight 905 hg = 90.5 kg, stats 340
    assert.equal(out.first.height_m, 0.4);
    assert.equal(out.second.height_m, 1.7);
    assert.equal(out.second.weight_kg, 90.5);
    assert.equal(out.taller, "charizard");
    assert.equal(out.heavier, "charizard");
    assert.equal(out.stronger, "charizard");
    assert.equal(out.first.total_base_stats, 220);
    assert.equal(out.second.total_base_stats, 340);
});

test("pokemon_compare reports a tie when both are equal", async (t) => {
    mockFetch(byName({ a: { ...PIKACHU, name: "a" }, b: { ...PIKACHU, name: "b" } }));
    t.after(() => { setFetchImpl(null); clearCache(); });

    const out = await callTool("pokemon_compare", { first: "a", second: "b" });
    assert.equal(out.taller, "tie");
    assert.equal(out.heavier, "tie");
    assert.equal(out.stronger, "tie");
});

test("pokemon_compare reports the failing side", async (t) => {
    mockFetch(byName({ pikachu: PIKACHU }));
    t.after(() => { setFetchImpl(null); clearCache(); });

    const out = await callTool("pokemon_compare", { first: "pikachu", second: "nope" });
    assert.equal(out.kind, "not_found");
    assert.match(out.error, /nope/);
});
