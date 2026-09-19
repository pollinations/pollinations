type AgentContext = {
  request: Request;
  pollinations: (path: string, init?: RequestInit) => Promise<Response>;
};

/**
 * scout-router — a deterministic model router.
 *
 * No classifier model is called: the routing decision comes from cheap request
 * signals plus live catalog and status data, so routing adds no extra latency,
 * no extra pollen, and a fully explainable trace. Per tier:
 *   EASY   — cheapest healthy candidate wins; community models win close ties.
 *   MEDIUM — value score: health + speed balanced against estimated cost.
 *   HARD   — quality proxy (pricier, larger-context models) within health limits.
 * A downstream failure escalates to the next candidate and demotes the failed
 * model for subsequent requests.
 */

const SELF = "scout-router";
const DEFAULT_MODEL = "openai/gpt-5.4-nano";
const MODEL_TTL_MS = 5 * 60_000;
const STATUS_TTL_MS = 2 * 60_000;
const DEMOTE_TTL_MS = 10 * 60_000;
const EST_PROMPT_TOKENS = 1_000; // cost estimate basis when input is tiny
const EST_COMPLETION_TOKENS = 500;

type ModelInfo = {
  id: string;
  category?: string;
  community?: boolean;
  input_modalities?: string[];
  output_modalities?: string[];
  supported_endpoints?: string[];
  pricing?: Record<string, unknown>;
  capabilities?: string[];
  context_length?: number;
  health?: { success_rate?: number; requests?: number };
};

type StatusRow = {
  model?: string;
  event_type?: string;
  is_rollup?: number;
  status_2xx?: number;
  errors_5xx?: number;
  latency_p50_ms?: number | null;
  tokens_per_second?: number | null;
};

type Catalog = { models: ModelInfo[]; byId: Map<string, ModelInfo>; status: Map<string, StatusRow> };

type Need = {
  modalities: string[];
  tools: boolean;
  inputTokens: number;
  tier: "EASY" | "MEDIUM" | "HARD";
  signals: string[];
};

type Candidate = {
  id: string;
  community: boolean;
  estCost: number; // pollen for ~1k prompt + 500 completion tokens
  health: number; // 0..1
  tps: number;
  p50: number;
  score: number;
};

// --- module-level caches (per isolate) --------------------------------------

let cache: { catalog?: Catalog; at?: number } = {};
const demoted = new Map<string, number>(); // model id -> ms of last downstream failure

const num = (v: unknown): number => (typeof v === "string" ? Number(v) : typeof v === "number" ? v : 0);
const price = (m: ModelInfo, key: string): number => num((m.pricing ?? {})[key]);

export function estimateCost(m: ModelInfo, promptTokens = EST_PROMPT_TOKENS): number {
  return promptTokens * price(m, "promptTextTokens") + EST_COMPLETION_TOKENS * price(m, "completionTextTokens");
}

// --- request signals --------------------------------------------------------

type Part = { type?: string; text?: unknown };
type Msg = { role?: string; content?: unknown };

/** Extract text length, input modalities and tools from a Responses or Chat body. */
export function readNeed(body: Record<string, unknown>): Need {
  const need: Need = { modalities: [], tools: false, inputTokens: 0, tier: "EASY", signals: [] };
  let text = "";
  let turns = 1;

  const feed = (content: unknown) => {
    if (typeof content === "string") {
      text += `\n${content}`;
      return;
    }
    if (!Array.isArray(content)) return;
    for (const part of content as Part[]) {
      const type = typeof part?.type === "string" ? part.type : "";
      if (type.includes("image")) need.modalities.push("image");
      else if (type.includes("audio")) need.modalities.push("audio");
      else if (type.includes("video")) need.modalities.push("video");
      if (typeof part?.text === "string") text += `\n${part.text}`;
    }
  };

  if (Array.isArray(body.input)) {
    const items = body.input as Msg[];
    turns = items.length;
    for (const msg of items) feed(msg?.content);
  } else if (typeof body.input === "string") {
    text += `\n${body.input}`;
  } else if (Array.isArray(body.messages)) {
    const msgs = body.messages as Msg[];
    turns = msgs.length;
    for (const msg of msgs) feed(msg?.content);
  }
  if (typeof body.instructions === "string") text = `${body.instructions}${text}`;
  need.tools = Array.isArray(body.tools) && body.tools.length > 0;
  need.inputTokens = Math.ceil(text.length / 4);

  if (need.tools) need.signals.push("tools");
  for (const mod of [...new Set(need.modalities)]) need.signals.push(mod);

  // Difficulty heuristic — transparent markers, cheapest tier by default.
  const fences = (text.match(/```/g) ?? []).length / 2;
  const hardHits = (text.match(/\b(architect|refactor|debug|algorithm|optimize|derive|prove|research|strategy|analyze|trade-?offs?)\b/gi) ?? []).length;
  if (fences >= 2 || hardHits >= 2 || text.length > 12_000 || turns > 8) {
    need.tier = "HARD";
    if (fences >= 2) need.signals.push("multi-code-blocks");
    if (hardHits >= 2) need.signals.push("reasoning-keywords");
    if (text.length > 12_000) need.signals.push("long-context");
  } else if (fences >= 1 || hardHits >= 1 || text.length > 2_000 || need.modalities.length > 0 || need.tools || turns > 3) {
    need.tier = "MEDIUM";
    if (fences >= 1) need.signals.push("code-block");
    if (hardHits >= 1) need.signals.push("reasoning-keyword");
  } else {
    need.signals.push("short-simple");
  }
  return need;
}

// --- catalog + status -------------------------------------------------------

async function loadCatalog(pollinations: AgentContext["pollinations"]): Promise<Catalog> {
  if (cache.catalog && Date.now() - (cache.at ?? 0) < MODEL_TTL_MS) return cache.catalog;
  const modelsRes = await pollinations("/v1/models");
  if (!modelsRes.ok) throw new Error(`model catalog request failed (${modelsRes.status})`);
  const body = (await modelsRes.json()) as { data?: ModelInfo[] } | ModelInfo[];
  const models = Array.isArray(body) ? body : (body.data ?? []);
  const byId = new Map(models.map((m) => [m.id, m]));

  const status = new Map<string, StatusRow>();
  try {
    const statusRes = await pollinations("/models/status?minutes=30");
    if (statusRes.ok) {
      const sBody = (await statusRes.json()) as { data?: StatusRow[] } | StatusRow[];
      const rows = Array.isArray(sBody) ? sBody : (sBody.data ?? []);
      for (const row of rows) {
        if (row.is_rollup !== 1 || !row.model) continue; // keep per-model rollups only
        const prev = status.get(row.model);
        const isText = row.event_type === "generate.text";
        if (!prev || (isText && prev.event_type !== "generate.text")) status.set(row.model, row);
      }
    }
  } catch {
    // Status is optional — the catalog alone still routes.
  }
  cache = { catalog: { models, byId, status }, at: Date.now() };
  return cache.catalog!;
}

function statusHealth(row?: StatusRow): { rate: number; tps: number; p50: number } {
  if (!row) return { rate: 1, tps: 45, p50: 3_000 };
  const ok = row.status_2xx ?? 0;
  const bad = row.errors_5xx ?? 0;
  return {
    rate: ok + bad > 0 ? ok / (ok + bad) : 1, // 4xx excluded: usually caller-side
    tps: row.tokens_per_second ?? 45,
    p50: row.latency_p50_ms ?? 3_000,
  };
}

// --- scoring ----------------------------------------------------------------

export function pickCandidates(catalog: Catalog, need: Need, self: string = SELF): Candidate[] {
  const needTokens = Math.max(need.inputTokens, EST_PROMPT_TOKENS);
  const raw: Candidate[] = [];

  for (const m of catalog.models) {
    if (m.category !== undefined && m.category !== "text") continue;
    if (!m.id || m.id.includes(self)) continue;
    if (m.id.startsWith("community/")) continue; // other agents — routing into a router recurses
    if (!(price(m, "promptTextTokens") > 0 || price(m, "completionTextTokens") > 0)) continue; // no token pricing -> cannot cost-rank
    if (!(m.supported_endpoints ?? []).some((e) => e === "/v1/responses")) continue;
    const inMods = (m.input_modalities ?? ["text"]).map((x) => x.toLowerCase());
    const outMods = (m.output_modalities ?? ["text"]).map((x) => x.toLowerCase());
    if (!outMods.includes("text")) continue;
    if (need.modalities.some((mod) => !inMods.includes(mod))) continue;
    if (need.tools && !(m.capabilities ?? []).includes("tool_calling")) continue;
    if ((m.context_length ?? 32_000) < needTokens) continue;

    const live = statusHealth(catalog.status.get(m.id));
    const health = live.rate * 0.6 + ((m.health?.success_rate ?? 95) / 100) * 0.4;
    if (health < 0.85) continue; // hard health gate
    raw.push({
      id: m.id,
      community: m.community === true,
      estCost: estimateCost(m, needTokens),
      health,
      tps: live.tps,
      p50: live.p50,
      score: 0,
    });
  }
  if (raw.length === 0) {
    const fallback = catalog.byId.get(DEFAULT_MODEL);
    if (fallback) {
      raw.push({ id: DEFAULT_MODEL, community: fallback.community === true, estCost: estimateCost(fallback, needTokens), health: 1, tps: 45, p50: 3_000, score: 0 });
    }
    return raw;
  }

  const maxCost = Math.max(...raw.map((c) => c.estCost));
  for (const c of raw) {
    const demotedRecently = (demoted.get(c.id) ?? 0) > Date.now() - DEMOTE_TTL_MS ? 10 : 0;
    if (need.tier === "EASY") {
      c.score = -c.estCost * 1e6 + (c.community ? 0.2 : 0) + c.tps / 1e4;
    } else if (need.tier === "HARD") {
      const quality = Math.log10(1 + c.estCost * 1e6) / 5; // price as capability proxy
      const context = Math.min(2_000_000, catalog.byId.get(c.id)?.context_length ?? 0) / 2_000_000;
      c.score = quality * 2 + context * 0.5 + c.health * 0.5 - c.estCost * 10 - demotedRecently;
    } else {
      c.score = c.health * 1.2 + Math.min(c.tps / 200, 1) * 0.3 - c.estCost / maxCost + (c.community ? 0.05 : 0) - demotedRecently;
    }
  }
  raw.sort((a, b) => b.score - a.score);
  return raw;
}

function reasonFor(c: Candidate, need: Need): string {
  const pollen = c.estCost.toFixed(6);
  const sig = need.signals.join(", ") || "plain chat";
  if (need.tier === "EASY") return `EASY (${sig}): cheapest healthy model, ~${pollen} pollen/req, ${Math.round(c.health * 100)}% ok`;
  if (need.tier === "HARD") return `HARD (${sig}): strongest healthy model by quality proxy, ~${pollen} pollen/req, ${Math.round(c.health * 100)}% ok`;
  return `MEDIUM (${sig}): best value (health+speed vs cost), ~${pollen} pollen/req, ${Math.round(c.health * 100)}% ok`;
}

// --- forwarding -------------------------------------------------------------

function forwardEndpoint(body: Record<string, unknown>): string {
  return body.input !== undefined ? "/v1/responses" : "/v1/chat/completions";
}

async function decorate(upstream: Response, chosen: Candidate, need: Need, escalations: string[]): Promise<Response> {
  const trace = {
    tier: need.tier,
    signals: need.signals,
    chosen: chosen.id,
    escalations,
    est_cost_pollen: Number(chosen.estCost.toFixed(9)),
    health_pct: Math.round(chosen.health * 100),
    tps: Math.round(chosen.tps),
  };
  console.log(`[scout-router] ${JSON.stringify(trace)}`);
  const headers = new Headers(upstream.headers);
  headers.set("x-scout-model", chosen.id);
  headers.set("x-scout-tier", need.tier);
  headers.set("x-scout-reason", reasonFor(chosen, need));
  headers.set("x-scout-trace", JSON.stringify(trace));
  // Gateways strip custom headers, so also embed the trace in JSON bodies.
  if ((upstream.headers.get("content-type") ?? "").includes("json")) {
    const text = await upstream.text();
    try {
      const json = JSON.parse(text) as object;
      return new Response(JSON.stringify({ ...json, scout_trace: trace }), { status: upstream.status, statusText: upstream.statusText, headers });
    } catch {
      return new Response(text, { status: upstream.status, statusText: upstream.statusText, headers });
    }
  }
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}

/** Test hook: clear module caches between tests. */
export function _resetCaches(): void {
  cache = {};
  demoted.clear();
}

export default async function agent({ request, pollinations }: AgentContext): Promise<Response> {
  const body = (await request.json()) as Record<string, unknown>;
  const need = readNeed(body);
  const catalog = await loadCatalog(pollinations);
  const candidates = pickCandidates(catalog, need);
  if (candidates.length === 0) {
    return Response.json({ error: { message: "scout-router: no healthy model matches the request" } }, { status: 502 });
  }
  const endpoint = forwardEndpoint(body);
  const escalations: string[] = [];
  for (const candidate of candidates.slice(0, 3)) {
    const res = await pollinations(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, model: candidate.id }),
    });
    if (res.ok) return await decorate(res, candidate, need, escalations);
    escalations.push(`${candidate.id}:${res.status}`);
    demoted.set(candidate.id, Date.now());
  }
  return Response.json(
    { error: { message: `scout-router: all candidates failed (${escalations.join(", ")})` } },
    { status: 502 },
  );
}
