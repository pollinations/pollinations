type AgentContext = {
	request: Request;
	pollinations: (path: string, init?: RequestInit) => Promise<Response>;
};

type AnyBody = Record<string, unknown>;

const WRITER_MODEL = "openai/gpt-5.4-nano";

function userText(body: AnyBody): string {
	const messages = body.messages;
	if (Array.isArray(messages)) {
		return messages
			.map((m) => {
				const c = (m as AnyBody)?.content;
				if (typeof c === "string") return c;
				if (Array.isArray(c)) {
					return c
						.map((p) => ((p as AnyBody)?.type === "text" ? String((p as AnyBody).text ?? "") : ""))
						.join(" ");
				}
				return "";
			})
			.join("\n");
	}
	const input = body.input;
	if (typeof input === "string") return input;
	return JSON.stringify(input ?? "");
}

function isChat(body: AnyBody): boolean {
	return Array.isArray(body.messages);
}

async function jevVote(
	pollinations: AgentContext["pollinations"],
	proposal: string,
): Promise<{ choice: string; probabilities: Record<string, number> }> {
	const res = await pollinations("/alpha/decisions", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			state: proposal,
			questions: {
				vote: {
					type: "choice",
					instructions:
						"Should this Nomic proposal pass? Vote yes only if it is clear, fun, and keeps the game balanced.",
					criteria: {
						yes: "Clear, fun proposal that keeps the game balanced",
						no: "Unclear, boring, or unbalancing proposal",
					},
				},
			},
		}),
	});
	if (!res.ok) throw new Error(`Jev request failed (${res.status})`);
	const data = (await res.json()) as AnyBody;
	const vote = (data.answers as AnyBody)?.vote as AnyBody;
	const choice = String(vote?.choice ?? "unknown");
	const probabilities = (vote?.probabilities ?? {}) as Record<string, number>;
	return { choice, probabilities };
}

async function writeArgument(
	pollinations: AgentContext["pollinations"],
	proposal: string,
	choice: string,
	probabilities: Record<string, number>,
): Promise<{ text: string; usage: unknown }> {
	const probs = Object.entries(probabilities)
		.map(([k, v]) => `${k}=${v}`)
		.join(", ");
	const res = await pollinations("/v1/responses", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			model: WRITER_MODEL,
			store: false,
			input: `A Nomic judge voted ${choice} (probabilities: ${probs}) on this proposal:\n${proposal}\nWrite a 2-3 sentence herald's argument defending that verdict, in a playful fox-herald voice.`,
		}),
	});
	if (!res.ok) throw new Error(`Writer model request failed (${res.status})`);
	const data = (await res.json()) as AnyBody;
	let text = "";
	const output = data.output;
	if (Array.isArray(output)) {
		for (const item of output) {
			const content = (item as AnyBody)?.content;
			if (Array.isArray(content)) {
				for (const part of content) {
					if ((part as AnyBody)?.type === "output_text" && typeof (part as AnyBody).text === "string") {
						text += (part as AnyBody).text as string;
					}
				}
			}
		}
	}
	if (!text) throw new Error("Writer model returned no text");
	return { text, usage: data.usage ?? null };
}

function envelope(trace: string, usage: unknown): AnyBody {
	const now = Math.floor(Date.now() / 1000);
	return {
		id: `resp_nomic_${now}`,
		object: "response",
		created: now,
		model: "nomic-player",
		status: "completed",
		trace,
		usage: usage ?? { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
	};
}

function chatResponse(trace: string, argument: string, usage: unknown): Response {
	return new Response(
		JSON.stringify({
			id: `chatcmpl_nomic_${Date.now()}`,
			object: "chat.completion",
			created: Math.floor(Date.now() / 1000),
			model: "nomic-player",
			choices: [{ index: 0, message: { role: "assistant", content: `${trace}\n${argument}` }, finish_reason: "stop" }],
			usage: usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
		}),
		{ status: 200, headers: { "content-type": "application/json" } },
	);
}

function responsesResponse(trace: string, argument: string, usage: unknown): Response {
	return new Response(
		JSON.stringify({
			...envelope(trace, usage),
			output: [
				{
					type: "message",
					role: "assistant",
					content: [{ type: "output_text", text: `${trace}\n${argument}` }],
				},
			],
		}),
		{ status: 200, headers: { "content-type": "application/json" } },
	);
}

export default async function agent({ request, pollinations }: AgentContext): Promise<Response> {
	const body = (await request.json()) as AnyBody;
	const proposal = userText(body).trim();
	if (!proposal) throw new Error("Empty proposal text");

	const { choice, probabilities } = await jevVote(pollinations, proposal);
	const { text, usage } = await writeArgument(pollinations, proposal, choice, probabilities);
	const trace = `[nomic-player: jev voted ${choice} ${JSON.stringify(probabilities)}]`;

	return isChat(body) ? chatResponse(trace, text, usage) : responsesResponse(trace, text, usage);
}
