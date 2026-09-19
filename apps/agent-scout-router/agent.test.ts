import assert from "node:assert/strict";
import test from "node:test";
import agent, { _resetCaches, pickCandidates, readNeed, estimateCost } from "./agent.ts";

type ModelInfo = Record<string, unknown>;

const MODEL_CATALOG: ModelInfo[] = [
  {
    id: "cheap/mini",
    category: "text",
    community: true,
    input_modalities: ["text"],
    output_modalities: ["text"],
    supported_endpoints: ["/v1/responses"],
    pricing: { promptTextTokens: "0.00000002", completionTextTokens: "0.0000001" },
    capabilities: [],
    context_length: 128_000,
    health: { success_rate: 99.9, requests: 100 },
  },
  {
    id: "mid/flash",
    category: "text",
    community: false,
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    supported_endpoints: ["/v1/responses", "/v1/chat/completions"],
    pricing: { promptTextTokens: "0.0000002", completionTextTokens: "0.000001" },
    capabilities: ["tool_calling"],
    context_length: 1_000_000,
    health: { success_rate: 99.5, requests: 1000 },
  },
  {
    id: "big/frontier",
    category: "text",
    community: false,
    input_modalities: ["text", "image"],
    output_modalities: ["text"],
    supported_endpoints: ["/v1/responses"],
    pricing: { promptTextTokens: "0.000002", completionTextTokens: "0.00001" },
    capabilities: ["tool_calling"],
    context_length: 2_000_000,
    health: { success_rate: 99.0, requests: 500 },
  },
  {
    id: "community/someone/other-router",
    category: "text",
    community: true,
    input_modalities: ["text"],
    output_modalities: ["text"],
    supported_endpoints: ["/v1/responses"],
    pricing: { currency: "pollen" }, // agent models publish no token rates
    capabilities: [],
    context_length: 128_000,
  },
  {
    id: "nolisting/noprice",
    category: "text",
    community: false,
    input_modalities: ["text"],
    output_modalities: ["text"],
    supported_endpoints: ["/v1/responses"],
    pricing: { currency: "pollen" },
    capabilities: [],
    context_length: 128_000,
  },
  {
    id: "sick/broken",
    category: "text",
    community: false,
    input_modalities: ["text"],
    output_modalities: ["text"],
    supported_endpoints: ["/v1/responses"],
    pricing: { promptTextTokens: "0.00000001", completionTextTokens: "0.00000005" },
    capabilities: [],
    context_length: 128_000,
    health: { success_rate: 50.0, requests: 100 },
  },
];

function catalogFixture(rows: unknown[] = []) {
  return {
    models: MODEL_CATALOG as never,
    byId: new Map(MODEL_CATALOG.map((m) => [(m as { id: string }).id, m as never])),
    status: new Map(
      rows.map((r) => [(r as { model: string }).model, r as never]),
    ),
  };
}

test.beforeEach(() => _resetCaches());

const responses = (payload: unknown, status = 200) =>
  new Response(typeof payload === "string" ? payload : JSON.stringify(payload), { status });

function downstream() {
  return responses({ ok: true });
}

test("estimateCost: pricing strings are per token, no rescaling", () => {
  const m = MODEL_CATALOG[0] as never;
  // 1000 * 0.00000002 + 500 * 0.0000001 = 0.00002 + 0.00005
  assert.equal(estimateCost(m).toFixed(7), "0.0000700");
});

test("readNeed: short plain input is EASY with short-simple signal", () => {
  const need = readNeed({ input: "hi there" });
  assert.equal(need.tier, "EASY");
  assert.deepEqual(need.signals, ["short-simple"]);
  assert.equal(need.modalities.length, 0);
});

test("readNeed: image parts require image modality and force MEDIUM", () => {
  const need = readNeed({
    input: [{ role: "user", content: [{ type: "input_image", image_url: "https://x/y.png" }, { type: "input_text", text: "what is this?" }] }],
  });
  assert.equal(need.tier, "MEDIUM");
  assert.deepEqual(need.modalities, ["image"]);
  assert.ok(need.signals.includes("image"));
});

test("readNeed: code blocks + reasoning keywords escalate to HARD; tools required", () => {
  const need = readNeed({
    instructions: "You are a code assistant.",
    input: "Refactor this algorithm:\n```\na\n```\n```\nb\n```\nAlso analyze the trade-offs.",
    tools: [{ type: "function", function: { name: "f" } }],
  });
  assert.equal(need.tier, "HARD");
  assert.equal(need.tools, true);
  assert.ok(need.signals.includes("multi-code-blocks"));
  assert.ok(need.signals.includes("reasoning-keywords"));
  assert.ok(need.signals.includes("tools"));
});

test("readNeed: handles chat-completions bodies (messages) too", () => {
  const need = readNeed({ messages: [{ role: "user", content: "Hello" }] });
  assert.equal(need.tier, "EASY");
  assert.equal(need.inputTokens, Math.ceil("\nHello".length / 4));
});

test("pickCandidates: EASY prefers cheapest healthy; broken model gated out", () => {
  const catalog = catalogFixture();
  const candidates = pickCandidates(catalog, readNeed({ input: "hi" }));
  assert.equal(candidates[0].id, "cheap/mini");
  assert.ok(candidates.every((c) => c.id !== "sick/broken"));
});

test("pickCandidates: excludes other agents and models without token pricing", () => {
  const catalog = catalogFixture();
  const candidates = pickCandidates(catalog, readNeed({ input: "hi" }));
  assert.ok(candidates.every((c) => !c.id.startsWith("community/")));
  assert.ok(candidates.every((c) => c.id !== "nolisting/noprice"));
});

test("pickCandidates: HARD picks the priciest capable model", () => {
  const catalog = catalogFixture();
  const need = readNeed({
    input: "Refactor this algorithm with analysis:\n```\na\n```\n```\nb\n```",
  });
  const candidates = pickCandidates(catalog, need);
  assert.equal(need.tier, "HARD");
  assert.equal(candidates[0].id, "big/frontier");
});

test("pickCandidates: image request drops text-only candidates", () => {
  const catalog = catalogFixture();
  const candidates = pickCandidates(catalog, readNeed({ input: [{ content: [{ type: "input_image", image_url: "x" }] }] }));
  assert.ok(candidates.every((c) => ["mid/flash", "big/frontier"].includes(c.id)));
});

test("pickCandidates: tools requirement drops tool-incapable models", () => {
  const catalog = catalogFixture();
  const candidates = pickCandidates(catalog, readNeed({ input: "use the tool please", tools: [{}] }));
  assert.ok(candidates.every((c) => !["cheap/mini", "sick/broken"].includes(c.id)));
});

test("pickCandidates: live 5xx-heavy status demotes a model below the health gate", () => {
  const catalog = catalogFixture([
    { model: "cheap/mini", event_type: "generate.text", is_rollup: 1, status_2xx: 5, errors_5xx: 20, tokens_per_second: 60, latency_p50_ms: 800 },
  ]);
  const candidates = pickCandidates(catalog, readNeed({ input: "hi" }));
  assert.ok(candidates.every((c) => c.id !== "cheap/mini"));
});

test("agent: routes simple request to cheapest model, forwards body unchanged, adds trace headers", async () => {
  const bodies: Record<string, unknown>[] = [];
  let call = 0;
  const result = await agent({
    request: new Request("https://example.com/v1/responses", {
      method: "POST",
      body: JSON.stringify({ model: "rekty/scout-router", input: "Say OK.", store: false }),
    }),
    pollinations: async (path, init) => {
      call++;
      if (call === 1) return responses({ data: MODEL_CATALOG });
      if (call === 2) return responses([]); // empty status is fine
      assert.equal(path, "/v1/responses");
      bodies.push(JSON.parse((init?.body as string) ?? "{}"));
      return downstream();
    },
  });
  assert.equal(call, 3);
  assert.equal(bodies[0].model, "cheap/mini");
  assert.equal(bodies[0].input, "Say OK.");
  assert.equal(bodies[0].store, false);
  assert.equal(result.headers.get("x-scout-model"), "cheap/mini");
  assert.equal(result.headers.get("x-scout-tier"), "EASY");
  const trace = JSON.parse(result.headers.get("x-scout-trace") ?? "{}");
  assert.equal(trace.tier, "EASY");
  assert.ok(trace.est_cost_pollen > 0);
  await result.text();
});

test("agent: escalates to the next candidate when the chosen model fails", async () => {
  const forwards: string[] = [];
  let call = 0;
  const result = await agent({
    request: new Request("https://example.com/v1/responses", {
      method: "POST",
      body: JSON.stringify({ input: "Say OK." }),
    }),
    pollinations: async (path, init) => {
      call++;
      if (call === 1) return responses({ data: MODEL_CATALOG });
      if (call === 2) return responses([]);
      forwards.push((JSON.parse((init?.body as string) ?? "{}") as { model: string }).model);
      return forwards.length === 1 ? responses({ error: "boom" }, 500) : downstream();
    },
  });
  assert.deepEqual(forwards, ["cheap/mini", "mid/flash"]);
  assert.equal(result.headers.get("x-scout-model"), "mid/flash");
  const trace = JSON.parse(result.headers.get("x-scout-trace") ?? "{}");
  assert.deepEqual(trace.escalations, ["cheap/mini:500"]);
  await result.text();
});

test("agent: reports 502 when every candidate fails", async () => {
  let call = 0;
  const result = await agent({
    request: new Request("https://example.com/v1/responses", {
      method: "POST",
      body: JSON.stringify({ input: "Say OK." }),
    }),
    pollinations: async () => {
      call++;
      if (call === 1) return responses({ data: MODEL_CATALOG });
      if (call === 2) return responses([]);
      return responses({ error: "boom" }, 500);
    },
  });
  assert.equal(result.status, 502);
  const payload = (await result.json()) as { error: { message: string } };
  assert.ok(payload.error.message.includes("all candidates failed"));
});

test("agent: forwards chat-completions bodies to /v1/chat/completions", async () => {
  const paths: string[] = [];
  let call = 0;
  await agent({
    request: new Request("https://example.com/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ model: "rekty/scout-router", messages: [{ role: "user", content: "Hi" }] }),
    }),
    pollinations: async (path, init) => {
      call++;
      if (call === 1) return responses({ data: MODEL_CATALOG });
      if (call === 2) return responses([]);
      paths.push(path);
      const body = JSON.parse((init?.body as string) ?? "{}") as { model: string };
      assert.equal(body.model, "cheap/mini");
      return downstream();
    },
  });
  assert.deepEqual(paths, ["/v1/chat/completions"]);
});
