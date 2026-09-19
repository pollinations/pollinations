type AgentContext = {
	request: Request;
	pollinations: (path: string, init?: RequestInit) => Promise<Response>;
};

type AnyBody = Record<string, unknown>;

const LONG_INPUT_CHARS = 20000;
const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 45000;

type CatalogModel = {
	name: string;
	category?: string;
	output_modalities?: string[];
	input_modalities?: string[];
	supported_endpoints?: string[];
	context_length?: number;
	pricing?: Record<string, string>;
	health?: { status?: string };
};

type RawEntry = Record<string, unknown>;

function normalize(raw: RawEntry): CatalogModel {
	return {
		name: String(raw.name ?? raw.id ?? ""),
		category: raw.category as string | undefined,
		output_modalities: raw.output_modalities as string[] | undefined,
		input_modalities: raw.input_modalities as string[] | undefined,
		supported_endpoints: raw.supported_endpoints as string[] | undefined,
		context_length: raw.context_length as number | undefined,
		pricing: raw.pricing as Record<string, string> | undefined,
		health: raw.health as { status?: string } | undefined,
	};
}

function priceOf(m: CatalogModel): number {
	const p = m.pricing ?? {};
	let sum = 0;
	let found = false;
	for (const [k, v] of Object.entries(p)) {
		if (k === "currency") continue;
		const n = Number(v);
		if (Number.isFinite(n)) {
			sum += n;
			found = true;
		}
	}
	return found && sum > 0 ? sum : Number.POSITIVE_INFINITY;
}

function healthRank(m: CatalogModel): number {
	const s = (m.health?.status ?? "unknown").toLowerCase();
	if (s === "healthy") return 0;
	if (s === "unknown") return 1;
	if (s === "degraded") return 2;
	return 3;
}

function isTextModel(m: CatalogModel, endpoint: string): boolean {
	if (m.category !== "text") return false;
	if (!m.output_modalities?.includes("text")) return false;
	if (m.supported_endpoints && !m.supported_endpoints.includes(endpoint)) return false;
	return true;
}

function byPrice(a: CatalogModel, b: CatalogModel): number {
	return healthRank(a) - healthRank(b) || priceOf(a) - priceOf(b);
}

function bodyTextLength(body: AnyBody): number {
	try {
		return JSON.stringify(body.messages ?? body.input ?? "").length;
	} catch {
		return 0;
	}
}

function wantsImage(body: AnyBody): boolean {
	try {
		const s = JSON.stringify(body.messages ?? body.input ?? "");
		return /image_url|input_image|image_url/i.test(s);
	} catch {
		return false;
	}
}

function isStreaming(body: AnyBody): boolean {
	return body.stream === true;
}

function pickLadder(models: CatalogModel[], endpoint: string, body: AnyBody): CatalogModel[] {
	const text = models.filter((m) => isTextModel(m, endpoint) && healthRank(m) < 3);
	const pool = text.length > 0 ? text : models.filter((m) => isTextModel(m, endpoint));
	const needLong = bodyTextLength(body) > LONG_INPUT_CHARS;
	const needVision = wantsImage(body);

	let fit = pool;
	if (needVision) {
		const vision = pool.filter((m) => m.input_modalities?.includes("image"));
		if (vision.length > 0) fit = vision;
	} else if (needLong) {
		const roomy = pool.filter((m) => (m.context_length ?? 0) >= 128000);
		if (roomy.length > 0) fit = roomy;
	}
	const sorted = [...fit].sort(byPrice);
	const ladder: CatalogModel[] = [];
	for (const m of sorted) {
		if (!ladder.some((x) => x.name === m.name)) ladder.push(m);
		if (ladder.length >= MAX_ATTEMPTS) break;
	}
	return ladder;
}

function reasonFor(pick: CatalogModel, body: AnyBody): string {
	if (wantsImage(body)) return "cheapest healthy vision-capable model";
	if (bodyTextLength(body) > LONG_INPUT_CHARS) return "cheapest healthy large-context model";
	return "cheapest healthy text model";
}

function prependTraceJson(original: unknown, endpoint: string, trace: string): string {
	const data = original as AnyBody;
	if (endpoint === "/v1/responses") {
		const output = data.output;
		if (Array.isArray(output)) {
			for (const item of output) {
				const content = (item as AnyBody)?.content;
				if (Array.isArray(content)) {
					for (const part of content) {
						if ((part as AnyBody)?.type === "output_text" && typeof (part as AnyBody).text === "string") {
							(part as AnyBody).text = `${trace}\n${(part as AnyBody).text}`;
							return JSON.stringify(data);
						}
					}
				}
			}
		}
		return JSON.stringify(data);
	}
	const choices = data.choices;
	if (Array.isArray(choices) && choices.length > 0) {
		const msg = (choices[0] as AnyBody)?.message as AnyBody | undefined;
		if (msg && typeof msg.content === "string") {
			msg.content = `${trace}\n${msg.content}`;
			return JSON.stringify(data);
		}
	}
	return JSON.stringify(data);
}

async function tryModel(
	pollinations: AgentContext["pollinations"],
	endpoint: string,
	body: AnyBody,
	model: string,
): Promise<Response | null> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), ATTEMPT_TIMEOUT_MS);
	try {
		const res = await pollinations(endpoint, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ ...body, model, stream: body.stream ?? false }),
			signal: ctrl.signal,
		});
		if (res.status === 429 || res.status >= 500) return null;
		return res;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}

export default async function agent({ request, pollinations }: AgentContext): Promise<Response> {
	const body = (await request.json()) as AnyBody;
	const endpoint = Array.isArray((body as { messages?: unknown }).messages)
		? "/v1/chat/completions"
		: "/v1/responses";

	const catalogRes = await pollinations("/v1/models?status=all");
	if (!catalogRes.ok) throw new Error(`Catalog fetch failed (${catalogRes.status})`);
	const catalog = (await catalogRes.json()) as { data?: RawEntry[] } | RawEntry[];
	const raw = Array.isArray(catalog) ? catalog : (catalog.data ?? []);
	const models = raw.map(normalize).filter((m) => m.name.length > 0);
	const ladder = pickLadder(models, endpoint, body);
	if (ladder.length === 0) throw new Error("No text models in catalog");

	if (isStreaming(body)) {
		return pollinations(endpoint, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ ...body, model: ladder[0].name }),
		});
	}

	const attempts: string[] = [];
	for (const pick of ladder) {
		const res = await tryModel(pollinations, endpoint, body, pick.name);
		if (res && res.ok) {
			attempts.push(`${pick.name} ok`);
			const trace = `[ladder-router: ${attempts.join(" -> ")} | ${reasonFor(pick, body)}]`;
			const text = await res.text();
			let out = text;
			try {
				out = prependTraceJson(JSON.parse(text), endpoint, trace);
			} catch {
				out = `${trace}\n${text}`;
			}
			return new Response(out, { status: res.status, headers: { "content-type": "application/json" } });
		}
		attempts.push(`${pick.name} failed, escalated`);
	}
	throw new Error(`All ladder models failed: ${attempts.join(" -> ")}`);
}
