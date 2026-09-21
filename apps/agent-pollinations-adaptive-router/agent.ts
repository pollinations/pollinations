type AgentContext = {
  request: Request;
  pollinations: (path: string, init?: RequestInit) => Promise<Response>;
};

type ResponsesRequest = Record<string, unknown> & {
  input?: unknown;
  instructions?: string | null;
};

type CatalogModel = {
  id: string;
  category?: string;
  agent?: boolean;
  input_modalities?: string[];
  output_modalities?: string[];
  pricing?: Record<string, string | number | null>;
};

type StatusRow = {
  model?: string;
  event_type?: string;
  is_rollup?: number;
  total_requests?: number;
  served?: number;
  errors_5xx?: number;
  fallback_rescues?: number;
  latency_p95_ms?: number | null;
};

type Profile = "FAST" | "BALANCED" | "CODE" | "DEEP" | "MULTIMODAL" | "MULTIMODAL_DEEP";

const POOLS: Record<Profile, readonly string[]> = {
  FAST: [
    "qwen/qwen3.7-flash",
    "inception/mercury-2.5-preview",
    "openai/gpt-5.4-nano",
    "z-ai/glm-5.3-flash",
  ],
  BALANCED: [
    "openai/gpt-5.4-mini",
    "google/gemini-3.8-flash",
    "qwen/qwen3.7-plus",
    "amazon/nova-2-lite-v1",
  ],
  CODE: [
    "openai/gpt-5.4-mini",
    "qwen/qwen3.7-plus",
    "google/gemini-3.8-flash",
    "openai/gpt-5.4",
  ],
  DEEP: [
    "openai/gpt-5.4",
    "x-ai/grok-4.3",
    "z-ai/glm-5.3",
    "anthropic/claude-sonnet-4.6",
  ],
  MULTIMODAL: [
    "google/gemini-3.8-flash",
    "qwen/qwen3.7-flash",
    "openai/gpt-5.4-mini",
    "qwen/qwen3.7-plus",
  ],
  MULTIMODAL_DEEP: [
    "openai/gpt-5.4",
    "x-ai/grok-4.3",
    "google/gemini-3.8-flash",
    "openai/gpt-5.4-mini",
  ],
};

const WEIGHTS: Record<Profile, { cost: number; health: number; latency: number; rank: number }> = {
  FAST: { cost: 1.4, health: 4, latency: 0.7, rank: 0.05 },
  BALANCED: { cost: 0.6, health: 4, latency: 0.4, rank: 0.12 },
  CODE: { cost: 0.45, health: 4, latency: 0.3, rank: 0.1 },
  DEEP: { cost: 0.25, health: 5, latency: 0.2, rank: 0.25 },
  MULTIMODAL: { cost: 0.5, health: 4, latency: 0.3, rank: 0.15 },
  MULTIMODAL_DEEP: { cost: 0.25, health: 5, latency: 0.2, rank: 0.25 },
};

function flattenText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(flattenText).join(" ");
  if (!value || typeof value !== "object") return "";
  const obj = value as Record<string, unknown>;
  return [obj.text, obj.content, obj.input, obj.value].map(flattenText).join(" ");
}

function detectModalities(value: unknown, found = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    found.add("text");
    return found;
  }
  if (Array.isArray(value)) {
    for (const item of value) detectModalities(item, found);
    return found;
  }
  if (!value || typeof value !== "object") return found;
  const obj = value as Record<string, unknown>;
  const type = typeof obj.type === "string" ? obj.type.toLowerCase() : "";
  if (type.includes("image")) found.add("image");
  if (type.includes("audio")) found.add("audio");
  if (type.includes("video")) found.add("video");
  if (type.includes("text") || typeof obj.text === "string") found.add("text");
  for (const child of Object.values(obj)) detectModalities(child, found);
  return found;
}

function classify(body: ResponsesRequest): { profile: Profile; modalities: string[]; text: string } {
  const text = `${body.instructions ?? ""} ${flattenText(body.input)}`.trim();
  const modalities = [...detectModalities(body.input)];
  if (!modalities.length) modalities.push("text");

  const lower = text.toLowerCase();
  const deep = /\b(research|architecture|architect|prove|proof|derive|trade-?offs?|threat model|root cause|multi-?step|strategy|synthesize|deep analysis)\b/.test(lower) || text.length > 2200;
  const code = /```|\b(debug|typescript|javascript|python|sql|regex|api|stack trace|refactor|implement|function|class|compiler|database)\b/.test(lower);
  const multimodal = modalities.some((m) => m !== "text");

  if (multimodal && deep) return { profile: "MULTIMODAL_DEEP", modalities, text };
  if (multimodal) return { profile: "MULTIMODAL", modalities, text };
  if (deep) return { profile: "DEEP", modalities, text };
  if (code) return { profile: "CODE", modalities, text };
  if (text.length <= 260 && text.split(/\s+/).length <= 45) return { profile: "FAST", modalities, text };
  return { profile: "BALANCED", modalities, text };
}

function numeric(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function blendedCost(model: CatalogModel): number {
  const pricing = model.pricing ?? {};
  const prompt = numeric(pricing.promptTextTokens);
  const completion = numeric(pricing.completionTextTokens);
  return prompt + 4 * completion;
}

function statusFor(modelId: string, rows: StatusRow[]): StatusRow | undefined {
  return rows.find((row) => row.is_rollup === 1 && row.event_type === "generate.text" && row.model === modelId);
}

function supports(model: CatalogModel, modalities: string[]): boolean {
  if (model.category && model.category !== "text") return false;
  if (model.agent) return false;
  const outputs = model.output_modalities ?? ["text"];
  if (!outputs.includes("text")) return false;
  const inputs = new Set(model.input_modalities ?? ["text"]);
  return modalities.every((m) => inputs.has(m));
}

function scoreCandidate(
  profile: Profile,
  model: CatalogModel,
  rank: number,
  minCost: number,
  status?: StatusRow,
) {
  const cost = Math.max(blendedCost(model), 1e-12);
  const costPenalty = Math.log2(Math.max(1, cost / Math.max(minCost, 1e-12)));
  const served = Math.max(status?.served ?? 0, 1);
  const total = Math.max(status?.total_requests ?? 0, 1);
  const error5xxRate = (status?.errors_5xx ?? 0) / served;
  const fallbackRate = (status?.fallback_rescues ?? 0) / total;
  const sparsePenalty = (status?.total_requests ?? 0) < 3 ? 0.18 : 0;
  const healthPenalty = error5xxRate + fallbackRate * 0.5 + sparsePenalty;
  const p95 = status?.latency_p95_ms;
  const latencyPenalty = p95 == null ? 0.8 : Math.log2(1 + Math.max(p95, 0) / 1000);
  const w = WEIGHTS[profile];
  const score = w.cost * costPenalty + w.health * healthPenalty + w.latency * latencyPenalty + w.rank * rank;
  return { score, cost, error5xxRate, fallbackRate, p95: p95 ?? null };
}

async function chooseModel(profile: Profile, modalities: string[], pollinations: AgentContext["pollinations"]) {
  const [catalogRes, statusRes] = await Promise.all([
    pollinations("/v1/models"),
    pollinations("/models/status?minutes=30"),
  ]);
  if (!catalogRes.ok) throw new Error(`Model catalog request failed (${catalogRes.status})`);

  const catalogJson = await catalogRes.json() as { data?: CatalogModel[] } | CatalogModel[];
  const catalog = Array.isArray(catalogJson) ? catalogJson : (catalogJson.data ?? []);
  let rows: StatusRow[] = [];
  if (statusRes.ok) {
    const statusJson = await statusRes.json() as { data?: StatusRow[] };
    rows = statusJson.data ?? [];
  }

  const byId = new Map(catalog.map((m) => [m.id, m]));
  const eligible = POOLS[profile]
    .map((id, rank) => ({ model: byId.get(id), rank }))
    .filter((x): x is { model: CatalogModel; rank: number } => !!x.model && supports(x.model, modalities));

  if (!eligible.length) throw new Error(`No compatible ${profile} candidates for modalities: ${modalities.join(",")}`);
  const minCost = Math.min(...eligible.map((x) => Math.max(blendedCost(x.model), 1e-12)));
  const scored = eligible.map(({ model, rank }) => ({
    model,
    rank,
    metrics: scoreCandidate(profile, model, rank, minCost, statusFor(model.id, rows)),
  })).sort((a, b) => a.metrics.score - b.metrics.score);

  const winner = scored[0];
  const m = winner.metrics;
  const p95Text = m.p95 == null ? "na" : `${m.p95}ms`;
  const reason = `profile=${profile};score=${m.score.toFixed(3)};cost=${m.cost.toExponential(2)};5xx=${(m.error5xxRate * 100).toFixed(1)}%;p95=${p95Text}`;
  return { model: winner.model.id, reason };
}

export default async function agent({ request, pollinations }: AgentContext): Promise<Response> {
  const body = await request.json() as ResponsesRequest;
  const { profile, modalities } = classify(body);
  const choice = await chooseModel(profile, modalities, pollinations);

  const downstream = await pollinations("/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, model: choice.model }),
  });

  const headers = new Headers(downstream.headers);
  headers.set("x-pollinations-router-model", choice.model);
  headers.set("x-pollinations-router-reason", choice.reason);
  headers.set("x-pollinations-router-profile", profile);

  return new Response(downstream.body, {
    status: downstream.status,
    statusText: downstream.statusText,
    headers,
  });
}

export { classify, chooseModel, blendedCost, scoreCandidate, supports };
