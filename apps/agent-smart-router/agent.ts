type AgentContext = {
	request: Request;
	pollinations: (path: string, init?: RequestInit) => Promise<Response>;
};

type ResponsesRequest = Record<string, unknown> & {
	input: string | Array<unknown>;
	instructions?: string | null;
};

interface ModelStatusRow {
	model: string;
	is_rollup: number;
	errors_5xx: number;
	total_requests: number;
}

const CLASSIFIER_MODEL = "openai/gpt-5.4-nano";

const TIER_ROUTES = {
	FAST: {
		primary: "inception/mercury-2.5-preview",
		fallback: "openai/gpt-5-nano",
		description: "Short answers, chit-chat, summaries, text formatting, and trivial queries."
	},
	BALANCED: {
		primary: "google/gemini-3.8-flash",
		fallback: "openai/gpt-5.4-nano",
		description: "Normal coding tasks, reasoning, multi-turn analysis, and structured outputs."
	},
	DEEP: {
		primary: "x-ai/grok-4.3",
		fallback: "google/gemini-3.8-flash",
		description: "Complex system architecture, hard algorithms, multi-step math, and deep logic."
	}
} as const;

type TierKey = keyof typeof TIER_ROUTES;

const CLASSIFIER_INSTRUCTIONS = `You are an automated task complexity classifier for an LLM gateway.
Analyze the user request and classify it into exactly one tier based on cognitive difficulty:
FAST — greetings, quick facts, short translations, trivial rewrites, simple chit-chat.
BALANCED — general coding, data extraction, creative writing, multi-turn dialogue, standard analysis.
DEEP — complex algorithms, deep architectural trade-offs, advanced mathematical reasoning, difficult bugs.

Return ONLY the single word (FAST, BALANCED, or DEEP) and nothing else.`;

function extractOutputText(responseObj: unknown): string {
	if (!responseObj || typeof responseObj !== "object") return "";
	const output = (responseObj as { output?: unknown }).output;
	if (!Array.isArray(output)) return "";

	return output
		.flatMap((item) =>
			item && typeof item === "object" && Array.isArray(item.content)
				? item.content
				: [],
		)
		.filter(
			(part) =>
				part &&
				typeof part === "object" &&
				part.type === "output_text" &&
				typeof part.text === "string",
		)
		.map((part) => part.text)
		.join("");
}

async function classifyTier(
	body: ResponsesRequest,
	pollinations: AgentContext["pollinations"]
): Promise<TierKey> {
	try {
		const res = await pollinations("/v1/responses", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				model: CLASSIFIER_MODEL,
				instructions: CLASSIFIER_INSTRUCTIONS,
				input: JSON.stringify({
					instructions: body.instructions,
					input: body.input,
				}),
				max_output_tokens: 8,
				store: false,
			}),
		});

		if (res.ok) {
			const text = extractOutputText(await res.json()).trim().toUpperCase();
			if (text in TIER_ROUTES) {
				return text as TierKey;
			}
		}
	} catch {
		// Fallback to BALANCED if classifier is momentarily unreachable
	}
	return "BALANCED";
}

async function resolveHealthyModel(
	tier: TierKey,
	pollinations: AgentContext["pollinations"]
): Promise<{ model: string; reason: string }> {
	const config = TIER_ROUTES[tier];
	let isPrimaryDegraded = false;

	try {
		const statusRes = await pollinations("/models/status?minutes=30");
		if (statusRes.ok) {
			const data = (await statusRes.json()) as { data?: ModelStatusRow[] };
			const rows = data?.data || [];
			const primaryStats = rows.find(
				(r) => r.model === config.primary && r.is_rollup === 1
			);

			if (primaryStats && primaryStats.total_requests > 5) {
				const errorRate = primaryStats.errors_5xx / primaryStats.total_requests;
				if (errorRate > 0.15) {
					isPrimaryDegraded = true;
				}
			}
		}
	} catch {
		// If health check fails, proceed with primary optimistically
	}

	if (isPrimaryDegraded) {
		return {
			model: config.fallback,
			reason: `Classified as ${tier}. Primary model (${config.primary}) reported elevated 5xx errors; rerouted to fallback.`,
		};
	}

	return {
		model: config.primary,
		reason: `Classified as ${tier} (${config.description}). Primary model is healthy.`,
	};
}

export default async function agent({
	request,
	pollinations,
}: AgentContext): Promise<Response> {
	const body = (await request.json()) as ResponsesRequest;
	const tier = await classifyTier(body, pollinations);
	const { model, reason } = await resolveHealthyModel(tier, pollinations);

	const upstreamResponse = await pollinations("/v1/responses", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ ...body, model }),
	});

	// Append diagnostic routing headers for transparency and verification
	const headers = new Headers(upstreamResponse.headers);
	headers.set("x-router-tier", tier);
	headers.set("x-router-selected-model", model);
	headers.set("x-router-reason", reason);

	return new Response(upstreamResponse.body, {
		status: upstreamResponse.status,
		statusText: upstreamResponse.statusText,
		headers,
	});
}
