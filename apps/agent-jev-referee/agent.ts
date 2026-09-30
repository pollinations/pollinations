/**
 * Jev referee — a code agent that makes one small Jev decision per run and
 * acts on it.
 *
 * In a tool-loop, an agent has to answer "am I done, still going, stuck, or
 * waiting on the user?" after every tool call. Most agents let the LLM decide
 * this implicitly, inside a giant prompt. This agent lifts that single,
 * repeated decision out of the prompt and hands it to Jev
 * (`POST /alpha/decisions`), which answers it with a calibrated choice plus
 * probabilities. The agent then acts strictly on the verdict: a text model
 * summarizes the final result, names the next step, proposes an alternative,
 * or asks the user for exactly what is missing.
 *
 * The verdict travels back with the answer in `x-jev-*` headers and in a
 * `jev` object inside JSON bodies, so callers can see the decision without
 * re-running the request.
 */

type AgentContext = {
    request: Request;
    pollinations: (path: string, init?: RequestInit) => Promise<Response>;
};

type Body = Record<string, unknown> & {
    model?: string;
    input?: unknown;
    messages?: unknown;
    instructions?: string | null;
};

type Status = "done" | "in-progress" | "stuck" | "blocked";

/** The one small decision, with rung descriptions Jev can separate cleanly. */
const STATUS_CRITERIA: Record<Status, string> = {
    done: "The goal has been fully achieved; the latest tool output shows the final result and no further action is needed",
    "in-progress": "Work is advancing; the latest tool output shows partial progress and the next step is clear",
    stuck: "The latest tool output shows an error, repeated failure, or an unresolvable obstacle; a different approach is needed",
    blocked: "The agent cannot proceed until the user provides something (credentials, a choice, a missing file, clarification)",
};

/** What the acting model should produce for each verdict. */
const ACTION_PROMPTS: Record<Status, string> = {
    done: "The run is DONE. Read the goal and the latest tool output and summarize the final result concisely, stating what was delivered and where.",
    "in-progress": "The run is IN PROGRESS. Read the goal and the latest tool output, then state the single clear next step to continue.",
    stuck: "The run is STUCK. Read the goal and the latest tool output, diagnose why the current approach fails, and propose one concrete alternative approach.",
    blocked: "The run is BLOCKED. Read the goal and the latest tool output, then list exactly what the user needs to provide for the agent to continue.",
};

/** Pull the last user text out of a Responses-shaped body. */
function userTextOf(body: Body): string {
    const parts: string[] = [];
    if (typeof body.instructions === "string" && body.instructions.trim()) {
        parts.push(body.instructions);
    }
    const input = Array.isArray(body.input) ? body.input : [];
    for (const item of input) {
        if (!item || typeof item !== "object") continue;
        const record = item as Record<string, unknown>;
        if (record.role === "system") continue;
        const content = record.content;
        if (typeof content === "string") {
            parts.push(content);
        } else if (Array.isArray(content)) {
            for (const block of content) {
                if (
                    block &&
                    typeof block === "object" &&
                    (block as Record<string, unknown>).type === "input_text"
                ) {
                    const text = (block as Record<string, unknown>).text;
                    if (typeof text === "string") parts.push(text);
                }
            }
        }
    }
    return parts.join("\n").trim();
}

/** Parse goal + latest tool output. Falls back gracefully when markers are absent. */
function parseRun(blob: string): { goal: string; output: string } {
    const goalMatch = blob.match(/goal\s*[:：]?\s*([^\n]+)/i);
    const outputMatch = blob.match(/latest tool output\s*[:：]?\s*([\s\S]+)/i);
    if (goalMatch && outputMatch) {
        return {
            goal: goalMatch[1].trim(),
            output: outputMatch[1].trim(),
        };
    }
    if (goalMatch) {
        return { goal: goalMatch[1].trim(), output: "" };
    }
    // No markers: treat the whole input as the goal and let Jev classify the
    // missing-output case (usually in-progress or blocked).
    return { goal: blob, output: "" };
}

async function askJev(
    pollinations: AgentContext["pollinations"],
    auth: string | null,
    goal: string,
    output: string,
): Promise<{ status: Status; probabilities: Record<string, number>; model: string }> {
    const payload = {
        state: {
            goal,
            latest_tool_output: output || "(no tool output yet)",
        },
        questions: {
            status: {
                type: "choice",
                instructions:
                    "Judge the status of this agent run from the goal and the latest tool output. Be strict: only mark done when the goal is actually achieved.",
                criteria: STATUS_CRITERIA,
            },
        },
    };
    const headers: Record<string, string> = {
        "content-type": "application/json",
    };
    if (auth) headers.authorization = auth;

    const response = await pollinations("/alpha/decisions", {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
    });
    if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Jev ${response.status}: ${text.slice(0, 300)}`);
    }
    const data = (await response.json()) as {
        model?: string;
        answers?: Record<string, { choice?: string; probabilities?: Record<string, number> }>;
    };
    const answer = data.answers?.status;
    if (!answer || !answer.choice || !(answer.choice in STATUS_CRITERIA)) {
        throw new Error("Jev returned no valid status choice");
    }
    return {
        status: answer.choice as Status,
        probabilities: answer.probabilities ?? {},
        model: data.model ?? "unknown",
    };
}

/** Act on the verdict with a normal text model. */
async function act(
    pollinations: AgentContext["pollinations"],
    auth: string | null,
    model: string,
    status: Status,
    goal: string,
    output: string,
): Promise<Response> {
    const system = ACTION_PROMPTS[status];
    const user = `Goal:\n${goal}\n\nLatest tool output:\n${output || "(no tool output yet)"}`;
    const headers: Record<string, string> = {
        "content-type": "application/json",
    };
    if (auth) headers.authorization = auth;

    return pollinations("/v1/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify({
            model,
            messages: [
                { role: "system", content: system },
                { role: "user", content: user },
            ],
            stream: false,
        }),
    });
}

async function withJevTrace(
    response: Response,
    jev: { status: Status; probabilities: Record<string, number>; model: string },
): Promise<Response> {
    console.log(
        JSON.stringify({
            jev_status: jev.status,
            jev_probabilities: jev.probabilities,
            jev_model: jev.model,
        }),
    );

    const headers = new Headers(response.headers);
    headers.set("x-jev-status", jev.status);
    headers.set("x-jev-probabilities", JSON.stringify(jev.probabilities));
    headers.set("x-jev-model", jev.model);

    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("application/json")) {
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
    }
    headers.delete("content-length");
    try {
        const payload = (await response.json()) as Record<string, unknown>;
        return Response.json(
            { ...payload, jev: { status: jev.status, probabilities: jev.probabilities, model: jev.model } },
            { status: response.status, headers },
        );
    } catch {
        return Response.json(
            { error: { message: "Jev referee could not read the model answer" }, jev },
            { status: response.status, headers },
        );
    }
}

export default async function agent({
    request,
    pollinations,
}: AgentContext): Promise<Response> {
    const body = (await request.json()) as Body;
    const auth = request.headers.get("authorization");
    const model =
        typeof body.model === "string" && body.model.trim()
            ? body.model
            : "openai/gpt-5.4-nano";

    let parsed;
    try {
        parsed = parseRun(userTextOf(body));
    } catch {
        return Response.json(
            { error: { message: "Could not read request input" } },
            { status: 400 },
        );
    }

    let jev;
    try {
        jev = await askJev(pollinations, auth, parsed.goal, parsed.output);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Response.json(
            { error: { message, type: "jev_error" } },
            { status: 502 },
        );
    }

    try {
        const answer = await act(pollinations, auth, model, jev.status, parsed.goal, parsed.output);
        if (!answer.ok) {
            return await withJevTrace(answer, jev);
        }
        return await withJevTrace(answer, jev);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Response.json(
            { error: { message, type: "model_error" }, jev },
            { status: 502, headers: { "x-jev-status": jev.status } },
        );
    }
}
