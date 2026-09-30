/**
 * Idea judge - a code agent where Jev makes the real decision per run.
 *
 * `input` is the idea text; optional `metadata.context` carries extra facts
 * (target users, constraints). One `POST /alpha/decisions` call asks Jev
 * four independent questions: three five-rung dimension scores (demand,
 * feasibility, novelty) and the `kill` / `fix` / `ship` choice. The agent
 * acts on Jev's choice - it is never overridden by code. A cheap text model
 * then writes the reasons; on failure a templated string citing Jev's own
 * probabilities takes its place, so the verdict never depends on it.
 *
 * Failure policy (fail closed, ordered):
 *  1. transport error or non-OK /alpha/decisions response -> 502.
 *  2. malformed JSON or invalid verdict (unknown choice, bad probabilities
 *     or confidence) -> 502.
 *  3. valid verdict + invalid dimension -> disclosed partial result: that
 *     dimension is null, "partial": true, composite/agreement become null.
 */

type PollinationsFetch = (
    path: string,
    init?: RequestInit,
) => Promise<Response>;

type AgentContext = {
    request: Request;
    pollinations: PollinationsFetch;
};

type Body = {
    input?: unknown;
    metadata?: { context?: unknown } | null;
};

type ChoiceAnswer = {
    type: "choice";
    choice: string;
    probabilities: Record<string, number>;
    confidence: number;
};

type ScoreAnswer = {
    type: "score";
    score: number;
    legend: Record<string, string>;
    probabilities: Record<string, number>;
    confidence: number;
};

type DecisionResponse = {
    answers?: Record<string, ChoiceAnswer | ScoreAnswer>;
};

const MODEL_ID = "afanasevmylife/pollinations-idea-judge-agent";
const REASON_MODEL = "openai-fast";
const MAX_CHARS = 8000;
const VERDICTS = ["kill", "fix", "ship"] as const;
type Verdict = (typeof VERDICTS)[number];
const VERDICT_TIER: Record<Verdict, number> = { kill: 0, fix: 0.5, ship: 1 };
const DIMENSIONS = ["demand", "feasibility", "novelty"] as const;
const SCORE_RUNGS = 5;

const DIMENSION_QUESTIONS: Record<
    string,
    { instructions: string; criteria: string[] }
> = {
    demand: {
        instructions:
            "Do people have this problem or desire strongly enough to pay or switch for it?",
        criteria: [
            "no one wants this",
            "niche curiosity only",
            "some real demand",
            "clear strong demand",
            "urgent widespread demand",
        ],
    },
    feasibility: {
        instructions:
            "Can a small team build this with current technology in weeks, not years?",
        criteria: [
            "impossible today",
            "research project",
            "hard but possible",
            "straightforward with effort",
            "trivial to build",
        ],
    },
    novelty: {
        instructions: "How differentiated is this from what already exists?",
        criteria: [
            "pure clone of existing products",
            "marginal variation",
            "some differentiation",
            "clearly distinct",
            "creates a new category",
        ],
    },
};

function errorResponse(message: string, status: number): Response {
    return Response.json(
        { error: { message, type: "idea_judge_error" } },
        { status },
    );
}

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

function truncate(text: string): string {
    return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}…` : text;
}

const isFiniteIn = (
    value: unknown,
    min: number,
    max: number,
): value is number =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max;

// Jev emits two-decimal probabilities; 0.01 covers rounding, nothing more.
const PROB_SUM_TOLERANCE = 0.01;

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
    const actual = Object.keys(value);
    return actual.length === keys.length && keys.every((k) => k in value);
}

function validVerdict(answer: unknown): answer is ChoiceAnswer {
    const a = answer as ChoiceAnswer | undefined;
    if (!a || a.type !== "choice") return false;
    if (!VERDICTS.includes(a.choice as Verdict)) return false;
    if (!isFiniteIn(a.confidence, 0, 1)) return false;
    const probs = a.probabilities;
    if (!probs || typeof probs !== "object" || Array.isArray(probs)) {
        return false;
    }
    if (!hasExactKeys(probs, [...VERDICTS])) return false;
    if (!VERDICTS.every((v) => isFiniteIn(probs[v], 0, 1))) return false;
    const sum = VERDICTS.reduce((total, v) => total + probs[v], 0);
    return Math.abs(sum - 1) <= PROB_SUM_TOLERANCE;
}

function validDimension(answer: unknown): answer is ScoreAnswer {
    const a = answer as ScoreAnswer | undefined;
    if (!a || a.type !== "score") return false;
    if (!isFiniteIn(a.score, 0, SCORE_RUNGS - 1)) return false;
    if (!isFiniteIn(a.confidence, 0, 1)) return false;
    const legend = a.legend;
    if (!legend || typeof legend !== "object" || Array.isArray(legend)) {
        return false;
    }
    const rungs = Array.from({ length: SCORE_RUNGS }, (_, i) => String(i));
    if (!rungs.every((r) => typeof legend[r] === "string")) return false;
    const probs = a.probabilities;
    if (!probs || typeof probs !== "object" || Array.isArray(probs)) {
        return false;
    }
    if (!hasExactKeys(probs, rungs)) return false;
    if (!rungs.every((r) => isFiniteIn(probs[r], 0, 1))) return false;
    const sum = rungs.reduce((total, r) => total + probs[r], 0);
    return Math.abs(sum - 1) <= PROB_SUM_TOLERANCE;
}

async function askJev(
    pollinations: PollinationsFetch,
    idea: string,
    context: string,
): Promise<DecisionResponse["answers"]> {
    let response: Response;
    try {
        response = await pollinations("/alpha/decisions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "jev",
                state: {
                    idea: truncate(idea),
                    context: truncate(context) || null,
                },
                questions: {
                    ...Object.fromEntries(
                        DIMENSIONS.map((name) => [
                            name,
                            { type: "score", ...DIMENSION_QUESTIONS[name] },
                        ]),
                    ),
                    verdict: {
                        type: "choice",
                        instructions:
                            "Should a builder kill, fix, or ship this idea? Judge the idea itself: its demand, feasibility, and novelty.",
                        criteria: {
                            kill: "not worth building in its current form",
                            fix: "promising, but needs a concrete change before building",
                            ship: "build it now, as described",
                        },
                    },
                },
            }),
        });
    } catch (err) {
        throw errorResponse(
            `decision upstream failed (network: ${err instanceof Error ? err.message : "unknown"})`,
            502,
        );
    }
    if (!response.ok) {
        throw errorResponse(
            `decision upstream failed (HTTP ${response.status})`,
            502,
        );
    }
    let parsed: DecisionResponse;
    try {
        parsed = (await response.json()) as DecisionResponse;
    } catch {
        throw errorResponse("decision upstream returned invalid JSON", 502);
    }
    if (!parsed || typeof parsed !== "object") {
        throw errorResponse(
            "decision upstream returned an invalid envelope",
            502,
        );
    }
    const answers = parsed.answers;
    if (!answers || !validVerdict(answers.verdict)) {
        throw errorResponse(
            "decision upstream returned an invalid verdict",
            502,
        );
    }
    return answers;
}

async function explain(
    pollinations: PollinationsFetch,
    idea: string,
    context: string,
    verdict: Verdict,
    answer: ChoiceAnswer,
    dimensions: Record<string, number | null>,
): Promise<string> {
    const probs = VERDICTS.map(
        (v) => `${v} ${answer.probabilities[v].toFixed(2)}`,
    ).join(", ");
    const dims = DIMENSIONS.map(
        (d) =>
            `${d} ${dimensions[d] === null ? "unknown" : dimensions[d]?.toFixed(2)}`,
    ).join(", ");
    const contextLine = context ? `\nContext: ${truncate(context)}` : "";
    try {
        const response = await pollinations("/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: REASON_MODEL,
                messages: [
                    {
                        role: "system",
                        content:
                            "Explain an idea verdict in two terse sentences: why this verdict, and the single most important caveat. No preamble.",
                    },
                    {
                        role: "user",
                        content: `Idea: ${truncate(idea)}${contextLine}\nVerdict: ${verdict.toUpperCase()} (probabilities: ${probs})\nDimensions (0-1): ${dims}`,
                    },
                ],
            }),
        });
        if (response.ok) {
            const payload = (await response.json()) as {
                choices?: { message?: { content?: string } }[];
            };
            const text = payload.choices?.[0]?.message?.content?.trim();
            if (text) return text;
        }
    } catch {
        // Fall through to the templated reason below.
    }
    return `Jev's verdict is ${verdict.toUpperCase()} with probabilities ${probs}.`;
}

export default async function ideaJudge({
    request,
    pollinations,
}: AgentContext): Promise<Response> {
    let body: Body;
    try {
        body = (await request.json()) as Body;
    } catch {
        return errorResponse("request body must be valid JSON", 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return errorResponse("request body must be a JSON object", 400);
    }
    const idea = textOf(body.input).trim();
    if (!idea) {
        return errorResponse("input must carry the idea text", 400);
    }
    const context = textOf(body.metadata?.context).trim();

    // Throws a 502 Response on upstream failure - fail closed, no verdict.
    const answers = await askJev(pollinations, idea, context).catch(
        (thrown) => {
            if (thrown instanceof Response) return thrown;
            throw thrown;
        },
    );
    if (answers instanceof Response) return answers;

    const verdictAnswer = answers.verdict as ChoiceAnswer;
    const verdict = verdictAnswer.choice as Verdict;

    let partial = false;
    const dimensions: Record<string, number | null> = {};
    for (const name of DIMENSIONS) {
        const answer = answers[name];
        if (validDimension(answer)) {
            dimensions[name] = answer.score / (SCORE_RUNGS - 1);
        } else {
            dimensions[name] = null;
            partial = true;
        }
    }

    const composite = partial
        ? null
        : DIMENSIONS.map((d) => dimensions[d] as number).reduce(
              (a, b) => a + b,
              0,
          ) / DIMENSIONS.length;
    const agreementFlag =
        composite !== null && Math.abs(composite - VERDICT_TIER[verdict]) > 0.5;

    const reasons = await explain(
        pollinations,
        idea,
        context,
        verdict,
        verdictAnswer,
        dimensions,
    );

    // The runtime requires a complete Responses-API object as the terminal
    // response (ids, status, usage); the verdict rides along as an extra key.
    return Response.json(
        {
            id: `resp_${crypto.randomUUID()}`,
            object: "response",
            created_at: Math.floor(Date.now() / 1000),
            model: MODEL_ID,
            status: "completed",
            error: null,
            incomplete_details: null,
            output: [
                {
                    id: `msg_${crypto.randomUUID()}`,
                    type: "message",
                    status: "completed",
                    role: "assistant",
                    content: [
                        {
                            type: "output_text",
                            text: `${verdict.toUpperCase()} - ${reasons}`,
                            annotations: [],
                        },
                    ],
                },
            ],
            usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
            verdict: {
                result: verdict,
                confidence: verdictAnswer.confidence,
                probabilities: verdictAnswer.probabilities,
                dimensions,
                composite,
                agreement_flag: composite === null ? null : agreementFlag,
                partial,
            },
        },
        {
            headers: {
                "x-idea-judge-verdict": verdict,
                "x-idea-judge-partial": String(partial),
            },
        },
    );
}
