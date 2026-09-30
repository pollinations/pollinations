// Idea Judge — a Pollinations code agent where Jev (typesafe/jev-1.13) makes the
// decision and a text model writes the reasoning.
//
// Flow: read the idea from the request -> ask Jev for a verdict, the biggest
// risk and a novelty probability -> hand Jev's answers to a text model that only
// explains them. Jev decides; the text model never re-decides. The caller pays
// for both with their own Pollen.
//
// Built on the Vercel AI SDK bundled by the Pollinations agent runtime.

import type { LanguageModel, ToolLoopAgentSettings, ToolSet } from "ai";

type AgentContext = {
    model: (id: string) => LanguageModel;
    respond: (
        settings: ToolLoopAgentSettings<never, ToolSet>,
    ) => Promise<Response>;
    pollinations: (path: string, init?: RequestInit) => Promise<Response>;
    request: Request;
};

const REASONER = "openai/gpt-5.4-nano";

// Jev's question set. `choice` questions require `criteria`; `noul` is a yes/no
// probability. (Verified against the live /alpha/decisions endpoint.)
const QUESTIONS = {
    verdict: {
        type: "choice",
        instructions: "Give a verdict on this idea.",
        criteria: {
            kill: "not worth pursuing",
            fix: "promising but needs meaningful changes",
            ship: "worth building now",
        },
    },
    biggest_risk: {
        type: "choice",
        instructions: "What is the biggest risk for this idea?",
        criteria: {
            market: "not enough people want it",
            tech: "hard to build",
            timing: "too early or too late",
            competition: "someone already does it well",
        },
    },
    novel: {
        type: "noul",
        instructions:
            "Is this meaningfully different from what already exists?",
    },
};

/** Pull the idea out of a Chat Completions or Responses request body. */
function readIdea(body: any): string {
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const lastUser = messages.filter((m: any) => m?.role === "user").at(-1);
    if (lastUser) {
        if (typeof lastUser.content === "string") return lastUser.content;
        if (Array.isArray(lastUser.content)) {
            return lastUser.content
                .map((part: any) => part?.text ?? "")
                .join("\n");
        }
    }
    if (typeof body?.input === "string") return body.input;
    if (Array.isArray(body?.input)) {
        return body.input
            .map((item: any) =>
                typeof item === "string"
                    ? item
                    : (Array.isArray(item?.content) ? item.content : [])
                          .map((part: any) => part?.text ?? "")
                          .join("\n"),
            )
            .join("\n");
    }
    return "";
}

export default async function agent({
    model,
    respond,
    pollinations,
    request,
}: AgentContext) {
    const body = await request.json().catch(() => ({}));
    const idea = readIdea(body).trim();
    if (!idea) return new Response("Send an idea to judge.", { status: 400 });

    // 1) Jev decides.
    const decision = await pollinations("/alpha/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: idea, questions: QUESTIONS }),
    });
    if (!decision.ok) {
        return new Response(`Jev failed: ${await decision.text()}`, {
            status: 502,
        });
    }
    const { answers = {} } = await decision.json();
    const verdict = String(answers?.verdict?.choice ?? "unknown").toUpperCase();

    // 2) A text model explains Jev's decision. It never re-decides.
    return respond({
        model: model(REASONER),
        instructions: [
            "You report a decision Jev already made about an idea. Jev is the decider; you only explain.",
            `Idea: ${idea}`,
            `Verdict: ${verdict}. Jev's raw answers: ${JSON.stringify(answers)}.`,
            "First line: the verdict in capitals. Then 2-4 sentences of reasoning.",
            "Use only the idea and Jev's answers. Do not invent facts, numbers or confidence values.",
        ].join("\n"),
        prompt: idea,
    });
}
