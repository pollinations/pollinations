type AgentContext = {
	request: Request;
	pollinations: (path: string, init?: RequestInit) => Promise<Response>;
};

type ResponsesRequest = Record<string, unknown> & {
	input?: unknown;
	instructions?: string | null;
	messages?: unknown;
};

type CatalogModel = {
	id: string;
	community?: boolean;
	category?: string;
	output_modalities?: string[];
	supported_endpoints?: string[];
	pricing?: { promptTextTokens?: string; completionTextTokens?: string };
};

type StatusRow = {
	model?: string;
	event_type?: string;
	is_rollup?: number;
	total_requests?: number;
	errors_5xx?: number;
	fallback_rescues?: number;
	latency_p50_ms?: number | null;
};

type Band = "EASY" | "NORMAL" | "HARD";

const FALLBACK = "openai";
const MAX_5XX_RATE = 0.08;
const MIN_REQUESTS = 3;

function inputText(body: ResponsesRequest): string {
	const parts: string[] = [];
	const walk = (v: unknown) => {
		if (typeof v === "string") parts.push(v);
		else if (Array.isArray(v)) v.forEach(walk);
		else if (v && typeof v === "object") {
			for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
				if (k === "image_url" || k === "input_image") continue;
				walk(val);
			}
		}
	};
	walk(body.input ?? body.messages);
	return parts.join("\n");
}

function bandFor(text: string): Band {
	const len = text.length;
	const hard =
		len > 2500 ||
		/```/.test(text) ||
		/\b(architect|prove|derive|optimiz|refactor|migrate|debug|design system)\b/i.test(
			text,
		);
	if (hard) return "HARD";
	if (len < 240 && !/\b(write|implement|explain in detail)\b/i.test(text))
		return "EASY";
	return "NORMAL";
}

function tokenCost(m: CatalogModel): number {
	const p = m.pricing ?? {};
	const a = Number.parseFloat(p.promptTextTokens ?? "NaN");
	const b = Number.parseFloat(p.completionTextTokens ?? "NaN");
	if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
	return a + b;
}

function isTextResponses(m: CatalogModel): boolean {
	return (
		m.category === "text" &&
		(m.output_modalities ?? []).includes("text") &&
		(m.supported_endpoints ?? []).includes("/v1/responses")
	);
}

function healthyIds(rows: StatusRow[]): Map<string, StatusRow> {
	const map = new Map<string, StatusRow>();
	for (const row of rows) {
		if (row.is_rollup !== 1 || row.event_type !== "generate.text" || !row.model)
			continue;
		const total = row.total_requests ?? 0;
		if (total < MIN_REQUESTS) continue;
		const rate = (row.errors_5xx ?? 0) / total;
		if (rate > MAX_5XX_RATE) continue;
		map.set(row.model, row);
	}
	return map;
}

async function pickModel(
	body: ResponsesRequest,
	pollinations: AgentContext["pollinations"],
): Promise<{ model: string; reason: string }> {
	const band = bandFor(inputText(body));
	const [catalogRes, statusRes] = await Promise.all([
		pollinations("/v1/models"),
		pollinations("/models/status?minutes=30"),
	]);
	if (!catalogRes.ok) {
		return { model: FALLBACK, reason: `catalog ${catalogRes.status}; fallback` };
	}
	const catalog = (await catalogRes.json()) as { data?: CatalogModel[] };
	const models = (catalog.data ?? []).filter(isTextResponses);
	const statusJson = statusRes.ok
		? ((await statusRes.json()) as { data?: StatusRow[] })
		: { data: [] };
	const health = healthyIds(statusJson.data ?? []);

	const pool = models
		.filter((m) => health.has(m.id))
		.map((m) => ({ m, cost: tokenCost(m), row: health.get(m.id)! }))
		.filter((x) => Number.isFinite(x.cost))
		.sort((a, b) => {
			// Prefer community on EASY when within 2x of cheapest overall.
			if (band === "EASY") {
				const ac = a.m.community ? 0 : 1;
				const bc = b.m.community ? 0 : 1;
				if (ac !== bc) return ac - bc;
			}
			// Prefer lower p50 for NORMAL ties.
			if (band === "NORMAL") {
				const al = a.row.latency_p50_ms ?? 1e9;
				const bl = b.row.latency_p50_ms ?? 1e9;
				if (al !== bl && Math.abs(al - bl) > 200) return al - bl;
			}
			return a.cost - b.cost;
		});

	if (pool.length === 0) {
		return { model: FALLBACK, reason: `${band}: no healthy pool; fallback` };
	}

	let chosen = pool[0]!;
	if (band === "HARD") {
		// Skip the cheapest third — pick a mid/high tier healthy model by cost.
		const idx = Math.min(pool.length - 1, Math.max(1, Math.floor(pool.length * 0.55)));
		chosen = pool[idx]!;
	} else if (band === "NORMAL") {
		const idx = Math.min(pool.length - 1, Math.max(0, Math.floor(pool.length * 0.2)));
		chosen = pool[idx]!;
	}

	const p50 = chosen.row.latency_p50_ms;
	const reason = [
		band,
		chosen.m.community ? "community" : "first-party",
		`cost=${chosen.cost.toExponential(2)}`,
		`5xx=${chosen.row.errors_5xx ?? 0}/${chosen.row.total_requests ?? 0}`,
		p50 != null ? `p50=${Math.round(p50)}ms` : "p50=n/a",
	].join(" ");

	return { model: chosen.m.id, reason };
}

function withRouterHeaders(
	upstream: Response,
	model: string,
	reason: string,
): Response {
	const headers = new Headers(upstream.headers);
	headers.set("x-pulse-router-model", model);
	headers.set("x-pulse-router-reason", reason);
	return new Response(upstream.body, {
		status: upstream.status,
		statusText: upstream.statusText,
		headers,
	});
}

export default async function agent({
	request,
	pollinations,
}: AgentContext): Promise<Response> {
	const body = (await request.json()) as ResponsesRequest;
	const { model, reason } = await pickModel(body, pollinations);

	const upstream = await pollinations("/v1/responses", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ ...body, model }),
	});

	return withRouterHeaders(upstream, model, reason);
}
