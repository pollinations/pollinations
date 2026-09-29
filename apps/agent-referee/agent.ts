/**
 * Referee — a code agent that asks Jev whether a "done" claim holds up
 * against the evidence for it, then writes the verdict in one sentence.
 *
 * `input` is the claim ("the null pointer bug is fixed"); `metadata.evidence`
 * is the diff, test output, or tool log backing it. Jev (`POST
 * /alpha/decisions`) answers two typed questions from those two strings — a
 * yes/no probability that the claim is fully true, and a five-rung evidence
 * quality score — and plain code turns the probability into PASS/FAIL against
 * a threshold. A cheap text model then writes the one-sentence explanation;
 * if that call fails, a templated sentence citing Jev's probability takes
 * its place, so the verdict itself never depends on it.
 */

type AgentContext = {
    request: Request;
    pollinations: (path: string, init?: RequestInit) => Promise<Response>;
};

type Body = {
    input?: unknown;
    metadata?: { evidence?: unknown; threshold?: unknown } | null;
};

type DecisionResponse = {
    answers: {
        verified: { noul: number };
        quality: { score: number; legend: Record<string, string> };
    };
};

const MAX_CHARS = 6000;
const DEFAULT_THRESHOLD = 0.6;

function textOf(value: unknown): string {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map(textOf).join("\n");
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        if (typeof record.text === "string") return record.text;
        if (record.content !== undefined) return textOf(record.content);
    }
    return "";
}

function clamp01(value: number): number {
    return Number.isFinite(value)
        ? Math.min(1, Math.max(0, value))
        : DEFAULT_THRESHOLD;
}

function truncate(text: string): string {
    return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}…` : text;
}

async function askJev(
    pollinations: AgentContext["pollinations"],
    claim: string,
    evidence: string,
): Promise<DecisionResponse> {
    const response = await pollinations("/alpha/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "jev",
            state: { claim: truncate(claim), evidence: truncate(evidence) },
            questions: {
                verified: {
                    type: "noul",
                    instructions:
                        "The evidence fully supports the claim: nothing the claim asserts is unproven or contradicted.",
                },
                quality: {
                    type: "score",
                    instructions:
                        "How well does the evidence support the claim overall?",
                    criteria: [
                        "no evidence given",
                        "evidence is unrelated or contradicts the claim",
                        "evidence partially supports the claim",
                        "evidence supports the claim but leaves a gap",
                        "evidence fully and directly supports the claim",
                    ],
                },
            },
        }),
    });
    if (!response.ok) throw new Error(`Jev returned ${response.status}`);
    return (await response.json()) as DecisionResponse;
}

async function explain(
    pollinations: AgentContext["pollinations"],
    claim: string,
    evidence: string,
    probability: number,
    verdict: "PASS" | "FAIL",
): Promise<string> {
    try {
        const response = await pollinations("/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "openai-fast",
                messages: [
                    {
                        role: "system",
                        content:
                            "Write one terse sentence explaining a verification verdict. No preamble, no restating the rule.",
                    },
                    {
                        role: "user",
                        content: `Claim: ${truncate(claim)}\nEvidence: ${truncate(evidence) || "(none given)"}\nJev's probability the claim is fully true: ${probability.toFixed(2)}\nVerdict: ${verdict}`,
                    },
                ],
            }),
        });
        if (!response.ok)
            throw new Error(`explainer returned ${response.status}`);
        const payload = (await response.json()) as {
            choices?: { message?: { content?: string } }[];
        };
        const text = payload.choices?.[0]?.message?.content?.trim();
        if (text) return text;
    } catch {
        // Fall through to the templated sentence below.
    }
    return `Jev put the claim's probability of being fully true at ${probability.toFixed(2)}, ${
        verdict === "PASS"
            ? "which clears the threshold."
            : "short of the threshold."
    }`;
}

export default async function referee({
    request,
    pollinations,
}: AgentContext): Promise<Response> {
    const body = (await request.json()) as Body;
    const claim = textOf(body.input).trim();
    if (!claim) {
        return Response.json(
            {
                error: {
                    message: "input must carry the claim to verify",
                    type: "referee_error",
                },
            },
            { status: 400 },
        );
    }
    const evidence = textOf(body.metadata?.evidence).trim();
    const threshold = clamp01(
        Number(body.metadata?.threshold ?? DEFAULT_THRESHOLD),
    );

    const decision = await askJev(pollinations, claim, evidence);
    const probability = decision.answers.verified.noul;
    const verdict: "PASS" | "FAIL" = probability >= threshold ? "PASS" : "FAIL";
    const text = await explain(
        pollinations,
        claim,
        evidence,
        probability,
        verdict,
    );

    return Response.json(
        {
            model: "referee",
            output: [
                {
                    type: "message",
                    role: "assistant",
                    content: [{ type: "output_text", text }],
                },
            ],
            verdict: {
                result: verdict,
                probability_true: probability,
                quality: decision.answers.quality,
                threshold,
            },
        },
        {
            headers: {
                "x-referee-verdict": verdict,
                "x-referee-probability": probability.toFixed(4),
            },
        },
    );
}
