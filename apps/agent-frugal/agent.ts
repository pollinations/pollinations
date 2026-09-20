type AgentContext = {
  request: Request;
  pollinations: (path: string, init?: RequestInit) => Promise<Response>;
};

type Tier = "FAST" | "BALANCED" | "DEEP";

type ResponsesBody = {
  model?: string;
  instructions?: string | null;
  input?: string | Array<unknown>;
  tools?: Array<unknown>;
  max_output_tokens?: number;
  previous_response_id?: string;
  [key: string]: unknown;
};

type CatalogModel = {
  id: string;
  category: string;
  community?: boolean;
  input_modalities?: string[];
  supported_endpoints?: string[];
  capabilities?: string[];
  pricing?: {
    promptTextTokens?: string;
    completionTextTokens?: string;
  };
};

type HealthRow = {
  model: string;
  is_rollup: number;
  event_type: string;
  total_requests: number;
  errors_4xx: number;
  errors_5xx: number;
  status_2xx: number;
  served: number;
  fallback_rescues: number;
  retried_503s: number;
  latency_p95_ms?: number | null;
  tokens_per_second?: number | null;
};

const MIN_SAMPLE = 10;

/* ---------------------------------------------------------------------------
 * Classification — pure code, zero LLM spend on routing.
 * ------------------------------------------------------------------------ */

export function tierForBody(body: ResponsesBody): {
  tier: Tier;
  is_long: boolean;
} {
  const input = body.input;
  const text = typeof input === "string" ? input : flatText(input);
  const instructions =
    typeof body.instructions === "string" ? body.instructions : "";
  const len = text.length + instructions.length;

  const isContinued =
    typeof body.previous_response_id === "string" ||
    (Array.isArray(body.input) && body.input.length > 2);
  const greedy = (body.max_output_tokens ?? 0) > 1600;
  const images = countImages(body.input);
  const hasTools = Array.isArray(body.tools) && body.tools.length > 0;
  const asksReasoning =
    /\b(prove|proof|derive|architecture|synthesi[sz]e|algorithm|rigorous|formal|explain why|step-by-step|design a)\b/i.test(
      text,
    );
  const asksLongForm =
    /\b(essay|long-form|comprehensive report|detailed analysis)\b/i.test(text);
  const asksCode =
    /```|\bfunction\b|\bclass\b|\bimport\b|\bconst\b|\bdef\b/.test(text);
  const isLong = len > 1800;

  let tier: Tier;
  if (isLong || greedy || asksReasoning || asksLongForm) tier = "DEEP";
  else if (isContinued || images > 0 || hasTools || asksCode || len > 400)
    tier = "BALANCED";
  else tier = "FAST";
  return { tier, is_long: isLong };
}

function flatText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (const item of value) {
      const obj = item as { text?: unknown; input_text?: unknown };
      if (obj && typeof obj === "object") {
        if (typeof obj.text === "string") parts.push(obj.text);
        else if (typeof obj.input_text === "string") parts.push(obj.input_text);
      }
    }
    return parts.join(" ");
  }
  return "";
}

function countImages(value: unknown): number {
  if (Array.isArray(value)) {
    return value.filter(
      (item) =>
        item &&
        typeof item === "object" &&
        (item as { type?: string }).type === "input_image",
    ).length;
  }
  return 0;
}

/* ---------------------------------------------------------------------------
 * Cost — per-request estimate, not a fixed unit price.
 * ------------------------------------------------------------------------ */

export function inputTokensFor(body: ResponsesBody): number {
  const input = body.input;
  const chars =
    typeof input === "string" ? input.length : flatText(input).length;
  return Math.max(1, Math.round(chars / 4));
}

export function outputTokensFor(tier: Tier): number {
  return tier === "FAST" ? 128 : tier === "BALANCED" ? 512 : 2048;
}

function priceOf(model: CatalogModel): { prompt: number; completion: number } {
  return {
    prompt: Number(model.pricing?.promptTextTokens ?? 0),
    completion: Number(model.pricing?.completionTextTokens ?? 0),
  };
}

export function estimatedCost(
  model: CatalogModel,
  inputTokens: number,
  outputTokens: number,
): number {
  const { prompt, completion } = priceOf(model);
  return inputTokens * prompt + outputTokens * completion;
}

/* ---------------------------------------------------------------------------
 * Health — a continuous penalty (sick = more expensive, rarely picked),
 * plus a hard safety ban only for genuinely dead models.
 * ------------------------------------------------------------------------ */

export function healthPenalty(row: HealthRow | undefined): number {
  if (!row || row.total_requests < MIN_SAMPLE) return 1.15;
  const errorRate = row.errors_5xx / row.total_requests;
  if (errorRate >= 0.1) return 5;
  if (errorRate >= 0.05) return 2.5;
  if (errorRate >= 0.02) return 1.35;
  return 1;
}

function isDead(row: HealthRow | undefined): boolean {
  if (!row || row.total_requests < MIN_SAMPLE) return false;
  const errorRate = row.errors_5xx / row.total_requests;
  if (errorRate >= 0.15) return true;
  if (row.status_2xx === 0 && row.total_requests > 0) return true;
  return false;
}

/* ---------------------------------------------------------------------------
 * Model selection.
 * ------------------------------------------------------------------------ */

type Pick = { model: string; tier: Tier; reason: string };

export async function select(
  body: ResponsesBody,
  pollinations: AgentContext["pollinations"],
): Promise<Pick> {
  const { tier: wantTier } = tierForBody(body);
  const inputTokens = inputTokensFor(body);
  const catalog = await getCatalog(pollinations);
  const health = await getHealth(pollinations);

  const needTools = Array.isArray(body.tools) && body.tools.length > 0;
  const hasImages = countImages(body.input) > 0;

  // Candidates that can actually serve this request.
  const eligible = catalog.filter((m) => {
    if (isDead(health.get(m.id))) return false;
    if (!(m.supported_endpoints ?? []).includes("/v1/responses")) return false;
    if (m.id.toLowerCase().includes("frugal")) return false; // never route to yourself
    if (m.community) return false; // foundation models only — agents are not router targets
    const { prompt, completion } = priceOf(m);
    if (prompt + completion <= 0) return false; // unpriced entries distort cost ranking
    if (!(m.input_modalities ?? ["text"]).includes("text")) return false;
    if (hasImages && !(m.input_modalities ?? []).includes("image"))
      return false;
    if (needTools && !(m.capabilities ?? []).includes("tool_calling"))
      return false;
    return true;
  });

  if (eligible.length === 0) {
    return {
      model: (catalog[0] ?? { id: "openai/gpt-5.4-nano" }).id,
      tier: wantTier,
      reason: `${wantTier}: no eligible healthy model — fell back to default`,
    };
  }

  // Rank by true per-request cost (input measured, output estimated by tier)
  // and adjust for health: a sick model must be remarkably cheaper to win.
  const ranked = eligible
    .map((m) => {
      const out = outputTokensFor(wantTier);
      const base = estimatedCost(m, inputTokens, out);
      const adj = base * healthPenalty(health.get(m.id));
      return { m, base, adj };
    })
    .sort((a, b) => a.adj - b.adj);

  const n = ranked.length;
  const third = Math.max(1, Math.ceil(n / 3));

  let slice: typeof ranked;
  if (wantTier === "FAST") slice = ranked.slice(0, third);
  else if (wantTier === "BALANCED") slice = ranked.slice(third, third * 2);
  else slice = ranked.slice(third * 2);

  // An empty middle/slow slice means the catalog skews tiny: widen outward.
  if (slice.length === 0) {
    if (wantTier === "BALANCED") slice = ranked.slice(0, third * 2);
    else if (wantTier === "DEEP") slice = ranked.slice(third);
  }

  const best = slice[0];
  const penalty = healthPenalty(health.get(best.m.id));
  return {
    model: best.m.id,
    tier: wantTier,
    reason: `${wantTier}: estimated ${inputTokens}+${outputTokensFor(wantTier)} tokens ≈ ${best.base.toFixed(10)} pollen ×${penalty.toFixed(2)} health (${best.adj.toFixed(10)}) — cheapest of ${slice.length}`,
  };
}

async function getCatalog(
  pollinations: AgentContext["pollinations"],
): Promise<CatalogModel[]> {
  const r = await pollinations("/v1/models");
  if (!r.ok) throw new Error(`catalog ${r.status}`);
  const j = (await r.json()) as { data: CatalogModel[] };
  return j.data.filter((m) => m.category === "text");
}

async function getHealth(
  pollinations: AgentContext["pollinations"],
): Promise<Map<string, HealthRow>> {
  const r = await pollinations("/models/status?minutes=30");
  if (!r.ok) throw new Error(`health ${r.status}`);
  const j = (await r.json()) as { data: HealthRow[] };
  const map = new Map<string, HealthRow>();
  for (const row of j.data) {
    if (
      row.is_rollup === 1 &&
      row.event_type === "generate.text" &&
      !map.has(row.model)
    ) {
      map.set(row.model, row);
    }
  }
  return map;
}

export default async function agent({
  request,
  pollinations,
}: AgentContext): Promise<Response> {
  const body = (await request.json()) as ResponsesBody;
  const picked = await select(body, pollinations);

  console.log(
    JSON.stringify({
      router: "frugal",
      tier: picked.tier,
      model: picked.model,
      reason: picked.reason,
    }),
  );

  const upstream = await pollinations("/v1/responses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, model: picked.model }),
  });

  const headers = new Headers(upstream.headers);
  headers.set("X-Frugal-Tier", picked.tier);
  headers.set("X-Frugal-Model", picked.model);
  headers.set("X-Frugal-Reason", picked.reason);
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}
