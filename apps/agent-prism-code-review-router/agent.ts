/**
 * prism — a request router deployed as a Pollinations code agent.
 *
 * Picks the model that answers each request, then answers as that model.
 * Tuned for engineering work (PR review, debugging, architecture, operations),
 * while still routing everyday questions, docs, data, and creative work.
 *
 * Design notes:
 * - The caller's pollen balance is read first; the per-request spend cap is
 *   derived from it (balance / 2), so a low wallet can never be drained by a
 *   flagship pick. Invisible balances (403) route uncapped, never fail.
 * - Classification is local and deterministic (regex + size features): no extra
 *   model call, no added latency, and the request payload is never sent to a
 *   second model just to decide who should answer it.
 * - Model selection uses the live `/v1/models` catalog and `/models/status`
 *   health rows, so routing follows real price/health/capability data.
 * - The original request is forwarded unchanged except for `model` and an
 *   appended engineering rubric for high tiers. Caller-provided values always
 *   win over router defaults.
 */

type AgentContext = {
	request: Request;
	pollinations: (path: string, init?: RequestInit) => Promise<Response>;
};

type Model = {
	id: string;
	input_modalities?: string[];
	context_length?: number;
	pricing?: { promptTextTokens?: string; completionTextTokens?: string };
	health?: { status?: string; success_rate?: number; requests?: number };
	capabilities?: string[];
	tools?: boolean;
	supported_parameters?: string[];
	supported_endpoints?: string[];
};

type StatusRow = {
	model?: string;
	is_rollup?: number;
	total_requests?: number;
	status_2xx?: number;
	errors_5xx?: number;
};

type Tier = "fast" | "balanced" | "deep";

type Classification = { tier: Tier; reason: string };

type Catalog = { models: Model[]; statuses: StatusRow[] };

/**
 * The caller's wallet, read before any routing decision. `maxCost` is the
 * per-request spend cap derived from the balance (balance / BALANCE_SAFETY).
 */
type Budget = {
	balance: number;
	maxCost: number;
	promptTokens: number;
	completionTokens: number;
};

/** Deterministic per-tier fallbacks when the live catalog is unavailable. */
const TIER_FALLBACKS: Record<Tier, string> = {
	fast: "openai/gpt-5.4-nano",
	balanced: "google/gemini-3.8-flash",
	deep: "x-ai/grok-4.3",
};

/** Health rows with fewer requests than this are treated as noise. */
const MIN_HEALTH_SAMPLE = 10;
/** Models above this 5xx rate over the last 30 minutes are considered degraded. */
const MAX_5XX_RATE = 0.1;
/** Models below this catalog success rate are considered degraded. */
const MIN_SUCCESS_RATE = 95;
/** Requests larger than this many characters are routed deep regardless of content. */
const LARGE_REQUEST_CHARS = 24_000;
/** Conservative chars→tokens factor used for context-length fitting. */
const CHARS_PER_TOKEN = 3;
/** How long the per-isolate catalog cache stays fresh. */
const CATALOG_TTL_MS = 60_000;
/** One request may plan to spend at most this fraction of the visible balance. */
const BALANCE_SAFETY = 2;
/** Assumed completion size for cost estimates when the caller sets no limit. */
const DEFAULT_COMPLETION_TOKENS = 500;

let catalogCache: { at: number; value: Catalog } | null = null;

function textOf(value: unknown): string {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value.map(textOf).join(" ");
	if (value && typeof value === "object") {
		const item = value as Record<string, unknown>;
		return [item.text, item.content, item.input, item.output].map(textOf).join(" ");
	}
	return "";
}

/** Requests that carry image parts need image-capable models. */
function hasImagePart(value: unknown): boolean {
	if (Array.isArray(value)) return value.some(hasImagePart);
	if (value && typeof value === "object") {
		const item = value as Record<string, unknown>;
		if (typeof item.type === "string" && /image/.test(item.type)) return true;
		return Object.values(item).some(hasImagePart);
	}
	return false;
}

/**
 * Estimate how much of the request is a unified diff or fenced code payload.
 * Reviews driven by real diffs justify a stronger model than keyword alone.
 */
function diffSignals(text: string): { hunks: number; diffLines: number } {
	const hunks = (text.match(/^@@/gm) ?? []).length;
	const diffLines = (text.match(/^[+-][^\n]/gm) ?? []).length;
	return { hunks, diffLines };
}

function classify(text: string): Classification {
	const code = /typescript|javascript|python|rust|golang|java|kotlin|swift|c\+\+|c#|php|ruby|sql|graphql|function|class|api|sdk|library|package|dependency|test|bug|compile|implement|debug/.test(
		text,
	);
	const review =
		/pull request|\bpr\b|diff|patch|review|merge|regression|changed files|code review|test failure|failing test/.test(text);
	const security =
		/security|auth|oauth|permission|secret|credential|injection|vulnerability|\bcve\b|xss|csrf|cryptograph|privacy|token/.test(text);
	const deep =
		/architecture|migration|refactor|distributed|concurrency|race condition|performance|deadlock|database schema|production|outage|incident|root cause|trade-?off|investigate|benchmark|scale|scaling|postmortem|threat model|compliance|multi-tenant|eventual consistency/.test(
			text,
		);
	const ops =
		/docker|kubernetes|k8s|terraform|cloudflare|aws|gcp|azure|ci\/cd|github actions|deploy|deployment|infrastructure|monitoring|observability|rollback/.test(
			text,
		);
	const planning = /design|plan|roadmap|specification|requirements|estimate|break down|milestone|acceptance criteria|technical decision|adr|rfc/.test(text);
	const data = /\betl\b|pipeline|analytics|warehouse|dashboard|transform|parse|extract|dataset/.test(text);
	const writing = /documentation|readme|changelog|release notes|tutorial|how-to|explain|summarize|rewrite|proofread|grammar|translate|brainstorm|copywriting|marketing|blog|story|caption/.test(text);

	const { hunks, diffLines } = diffSignals(text);
	const diffPayload = hunks >= 2 || diffLines >= 20;
	const size = text.length;

	if (security) return { tier: "deep", reason: "security-sensitive change" };
	if (review && deep) return { tier: "deep", reason: "architectural PR analysis" };
	if (deep && ops) return { tier: "deep", reason: "high-impact systems or operations work" };
	if (size > LARGE_REQUEST_CHARS) return { tier: "deep", reason: "large-context request" };
	if (review) return { tier: "balanced", reason: "code review or diff context" };
	if (deep) return { tier: diffPayload || size > 8000 ? "deep" : "balanced", reason: "non-trivial engineering depth" };
	if (planning || ops) return { tier: "balanced", reason: planning ? "design and planning work" : "infrastructure or deployment task" };
	// Small code questions ("what does this X return?") stay cheap: keyword
	// matches alone don't justify a mid-tier model when the payload is tiny.
	if (code && size < 500 && !data) return { tier: "fast", reason: "small targeted coding request" };
	if (code || data) return { tier: "balanced", reason: "multi-step engineering or data task" };
	return { tier: "fast", reason: writing ? "documentation or language task" : "short general request" };
}

/** Models with no listed token pricing (free community listings) cost nothing. */
function isFree(model: Model): boolean {
	return !model.pricing?.promptTextTokens && !model.pricing?.completionTextTokens;
}

function tokenCost(model: Model): number {
	if (isFree(model)) return 0;
	const price = (value: string | undefined) => {
		const parsed = Number(value ?? 1);
		return Number.isFinite(parsed) ? parsed : 1;
	};
	return price(model.pricing?.promptTextTokens) + price(model.pricing?.completionTextTokens);
}

/** Estimated pollen cost of this request on a model, at catalog prices. */
function estimateCost(model: Model, promptTokens: number, completionTokens: number): number {
	if (isFree(model)) return 0;
	return (
		promptTokens * Number(model.pricing?.promptTextTokens ?? 1) +
		completionTokens * Number(model.pricing?.completionTextTokens ?? 1)
	);
}

function supportsReasoning(model: Model): boolean {
	return (
		(model.capabilities ?? []).includes("reasoning") ||
		(model.supported_parameters ?? []).includes("reasoning_effort")
	);
}

/**
 * Degrade detection for "prefer free community models, switch when one
 * degrades". Unproven models (status "unknown", no traffic) are allowed —
 * only positive evidence of degradation excludes a model:
 * explicit "down"/"degraded" catalog status, a low success rate on a real
 * sample, a 5xx-heavy status row, or a status row where every request failed.
 */
function isHealthy(model: Model, status?: StatusRow): boolean {
	const health = model.health;
	if (health?.status && health.status !== "healthy" && health.status !== "unknown") return false;
	if (
		health?.success_rate !== undefined &&
		health.success_rate !== null &&
		(health.requests ?? 0) >= MIN_HEALTH_SAMPLE &&
		health.success_rate < MIN_SUCCESS_RATE
	) {
		return false;
	}
	if (status && (status.total_requests ?? 0) >= MIN_HEALTH_SAMPLE) {
		if ((status.errors_5xx ?? 0) / (status.total_requests ?? 1) > MAX_5XX_RATE) return false;
		if ((status.status_2xx ?? 0) === 0) return false;
	}
	return true;
}

/**
 * Pick a concrete model id for the request.
 *
 * Policy, in order: hard capability gates (health, Responses-API support,
 * context fit, modality, tools) → wallet cap (models the balance can't
 * afford for this request are dropped before ranking) → free-community
 * preference with automatic switchover on degradation, cost ranking for
 * fast/balanced, reasoning-first quality ranking for deep.
 */
export function choose(
	models: Model[],
	statuses: StatusRow[],
	tier: Tier,
	text: string,
	budget: Budget | null = null,
): { id: string; reason: string } {
	const statusByModel = new Map(
		statuses.filter((row) => row.is_rollup === 1).map((row) => [row.model, row]),
	);
	const needsTools = /tool|repository|github|run tests|execute|inspect files/.test(text);
	const needsImage = hasImagePart(text);
	const minContext = Math.ceil(text.length / CHARS_PER_TOKEN) + 4_000;

	const eligible = models.filter(
		(m) =>
			isHealthy(m, statusByModel.get(m.id)) &&
			// the router forwards to the stateless Responses API; many community
			// and proxy models don't support it and would 400 at the gateway
			(m.supported_endpoints ?? []).includes("/v1/responses") &&
			(m.context_length ?? 0) >= minContext &&
			(m.input_modalities ?? ["text"]).includes("text") &&
			(!needsImage || (m.input_modalities ?? []).includes("image")) &&
			(!needsTools || m.tools || (m.capabilities ?? []).includes("tool_calling")),
	);
	if (!eligible.length) throw new Error("no eligible model");

	// Wallet cap: drop models whose estimated cost for THIS request exceeds
	// the per-request spend cap derived from the caller's visible balance.
	let pool = eligible;
	let budgetNote = "";
	if (budget) {
		const affordable = eligible.filter(
			(m) => estimateCost(m, budget.promptTokens, budget.completionTokens) <= budget.maxCost,
		);
		if (affordable.length) {
			if (affordable.length < eligible.length) {
				pool = affordable;
				budgetNote = `; wallet-capped (balance ${budget.balance}, max spend ${budget.maxCost.toFixed(4)})`;
			}
		} else {
			// Nothing fits the cap — route to the cheapest so the caller gets a
			// real answer if it lands under budget, or a clean 402 if truly broke.
			const cheapest = [...eligible].sort((a, b) => tokenCost(a) - tokenCost(b))[0];
			return {
				id: cheapest.id,
				reason: `balance ${budget.balance} below per-request cap ${budget.maxCost.toFixed(4)}; cheapest model to preserve wallet`,
			};
		}
	}

	// Deep tier pays for quality: reasoning-capable models first, then the
	// largest context, then the highest listed price (flagship proxy). Free
	// community models only win here on equal reasoning AND context — deep is
	// deliberately the tier where paying for strength is allowed, and the
	// wallet cap (not free preference) protects affordability.
	if (tier === "deep") {
		const ranked = [...pool].sort(
			(a, b) =>
				Number(supportsReasoning(b)) - Number(supportsReasoning(a)) ||
				(b.context_length ?? 0) - (a.context_length ?? 0) ||
				tokenCost(b) - tokenCost(a),
		);
		const selected = ranked[0];
		return {
			id: selected.id,
			reason: `strongest affordable model (${supportsReasoning(selected) ? "reasoning-capable" : "largest context"}, ${selected.context_length ?? "?"} ctx)${budgetNote}`,
		};
	}

	// Fast/balanced tiers prefer free community models, switching away when a
	// community model degrades (it fails the health gate and the pool falls
	// back to paid catalog models), then rank by live token price: lowest for
	// fast, median for balanced avoids both toy models and accidental flagships.
	const free = pool.filter(isFree);
	const priced = free.length ? free : pool;
	const ranked = [...priced].sort((a, b) => tokenCost(a) - tokenCost(b));
	const selected = tier === "fast" ? ranked[0] : ranked[Math.floor((ranked.length - 1) / 2)];
	if (!selected) throw new Error("no eligible model");
	return {
		id: selected.id,
		reason: `${tier} tier; ${free.length ? "healthy free community model" : "healthy catalog model"} at ${tier === "fast" ? "lowest" : "median"} live token price${budgetNote}`,
	};
}

async function loadCatalog(pollinations: AgentContext["pollinations"]): Promise<Catalog> {
	if (catalogCache && Date.now() - catalogCache.at < CATALOG_TTL_MS) return catalogCache.value;
	const [modelsResponse, statusResponse] = await Promise.all([
		pollinations("/v1/models"),
		pollinations("/models/status?minutes=30"),
	]);
	if (!modelsResponse.ok) throw new Error(`models catalog failed (${modelsResponse.status})`);
	const modelsJson = (await modelsResponse.json()) as { data?: Model[] };
	const statuses = statusResponse.ok ? ((await statusResponse.json()) as { data?: StatusRow[] }).data ?? [] : [];
	const value = { models: modelsJson.data ?? [], statuses };
	catalogCache = { at: Date.now(), value };
	return value;
}

/**
 * Read the caller's pollen balance before routing. Returns null when the
 * balance isn't visible (e.g. unbudgeted keys without `account:usage` get 403)
 * — routing then proceeds uncapped instead of failing.
 */
async function loadBalance(pollinations: AgentContext["pollinations"]): Promise<number | null> {
	try {
		const response = await pollinations("/account/balance");
		if (!response.ok) return null;
		const data = (await response.json()) as { balance?: number };
		return typeof data.balance === "number" && data.balance >= 0 ? data.balance : null;
	} catch {
		return null;
	}
}

/**
 * Append the engineering rubric for non-trivial work. Only balances and deeps
 * get it — fast requests are usually one-shot questions that don't need it.
 */
function rubricFor(tier: Tier): string {
	if (tier === "fast") return "";
	return `

be rigorous and useful: separate confirmed facts from hypotheses, state assumptions, and never invent repository context. for code, pr, or diff work, prioritize correctness, security, regressions, data loss, concurrency, performance, api compatibility, maintainability, accessibility, observability, and missing tests; cite exact files, symbols, or hunks when available and explain impact, confidence, and a practical fix. for plans and operations work, include risks, rollback, verification, and edge cases. for data work, validate nulls, boundaries, and reproducibility.`;
}

export default async function agent({ request, pollinations }: AgentContext): Promise<Response> {
	// Malformed bodies still get forwarded: the gateway owns request validation
	// and returns proper errors; the router should not become a failure point.
	let body: Record<string, unknown>;
	try {
		body = (await request.json()) as Record<string, unknown>;
	} catch {
		return pollinations("/v1/responses", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: await request.text(),
		});
	}

	const text = [body.instructions, body.input, body.messages].map(textOf).join(" ");
	const classification = classify(text);

	// Read the wallet FIRST, then derive the per-request spend cap from it —
	// never the other way around. A balance of 2 pollen must never see a
	// flagship deep pick silently drain it.
	const balance = await loadBalance(pollinations);
	const promptTokens = Math.ceil(text.length / CHARS_PER_TOKEN);
	const completionTokens =
		typeof body.max_output_tokens === "number" ? body.max_output_tokens : DEFAULT_COMPLETION_TOKENS;
	const budget: Budget | null =
		balance === null ? null : { balance, maxCost: balance / BALANCE_SAFETY, promptTokens, completionTokens };

	let routed: { model: string; reason: string; catalog: "live" | "fallback" };
	try {
		const { models, statuses } = await loadCatalog(pollinations);
		const selected = choose(models, statuses, classification.tier, text, budget);
		routed = { model: selected.id, reason: selected.reason, catalog: "live" };
	} catch {
		routed = { model: TIER_FALLBACKS[classification.tier], reason: "live catalog unavailable, deterministic tier fallback", catalog: "fallback" };
	}

	// Note: the Responses API body schema rejects `reasoning_effort`, so deep-tier
	// rigor comes from the rubric below and from preferring reasoning-capable
	// models — not from injected parameters.
	const routedBody: Record<string, unknown> = {
		...body,
		model: routed.model,
		instructions: `${typeof body.instructions === "string" ? body.instructions : ""}${rubricFor(classification.tier)}`,
	};

	const trace = `${classification.reason}; ${routed.reason}; catalog=${routed.catalog}${balance === null ? "; balance=private" : `; balance=${balance}`}`;
	console.log(JSON.stringify({ router: "prism", tier: classification.tier, model: routed.model, balance, reason: trace }));

	const response = await pollinations("/v1/responses", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(routedBody),
	});

	// Gateway conversions may drop custom headers on other endpoints, so the
	// same trace is also logged (see above). Strip length/encoding headers
	// because the forwarded body is re-streamed verbatim.
	const headers = new Headers(response.headers);
	headers.delete("content-length");
	headers.delete("content-encoding");
	headers.set("x-pollinations-router", "prism");
	headers.set("x-pollinations-router-model", routed.model);
	headers.set("x-pollinations-router-tier", classification.tier);
	headers.set("x-pollinations-router-reason", trace);
	return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
