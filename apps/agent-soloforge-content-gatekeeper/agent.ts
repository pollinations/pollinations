type AgentContext = {
  request: Request;
  pollinations: (path: string, init?: RequestInit) => Promise<Response>;
};

type DecisionAnswer = {
  type: "choice";
  choice: "PUBLISH" | "REVISE" | "REJECT";
  confidence?: number;
  probabilities?: Record<string, number>;
};

type DecisionResponse = {
  id?: string;
  model?: string;
  provider?: string;
  answers?: {
    gate?: DecisionAnswer;
  };
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

function extractUserInput(body: any): unknown {
  if (typeof body?.input === "string") return body.input;
  if (Array.isArray(body?.input)) return body.input;

  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const latestUser = [...messages]
    .reverse()
    .find((message) => message?.role === "user");

  return latestUser?.content ?? body;
}

function actionFor(choice: DecisionAnswer["choice"]) {
  if (choice === "PUBLISH") {
    return {
      action: "SEND_TO_APPROVAL_QUEUE",
      nextStep:
        "Keep the draft unchanged and move it to the human approval queue.",
    };
  }

  if (choice === "REVISE") {
    return {
      action: "RETURN_TO_GENERATOR",
      nextStep:
        "Return the draft to the generator with a revision request before approval.",
    };
  }

  return {
    action: "BLOCK",
    nextStep:
      "Do not publish this draft. Keep it blocked until a new version is generated.",
  };
}

export default async function agent({
  request,
  pollinations,
}: AgentContext): Promise<Response> {
  const body = await request.json();
  const content = extractUserInput(body);

  const decisionResponse = await pollinations("/alpha/decisions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "jev",
      state: {
        content,
        purpose:
          "Decide whether an AI-generated content draft should advance in a creator automation workflow.",
      },
      questions: {
        gate: {
          type: "choice",
          instructions:
            "Choose the workflow decision for this draft. Judge whether it is coherent, relevant to the apparent user intent, specific enough to be useful, safe to send to a human approval queue, and free of obvious contradictions or placeholder text.",
          criteria: {
            PUBLISH:
              "The draft is coherent, relevant, usable, and ready for human approval without another generation pass.",
            REVISE:
              "The core idea is usable but the draft needs a meaningful rewrite, clarification, completion, or cleanup before human approval.",
            REJECT:
              "The draft is clearly unusable, off-topic, contradictory, unsafe, spam-like, or fundamentally mismatched to the task.",
          },
        },
      },
    }),
  });

  if (!decisionResponse.ok) {
    const detail = await decisionResponse.text();
    throw new Error(
      `Jev decision request failed (${decisionResponse.status}): ${detail}`,
    );
  }

  const decision = (await decisionResponse.json()) as DecisionResponse;
  const gate = decision.answers?.gate;

  if (
    !gate ||
    gate.type !== "choice" ||
    !["PUBLISH", "REVISE", "REJECT"].includes(gate.choice)
  ) {
    throw new Error("Jev returned an invalid gate decision");
  }

  const action = actionFor(gate.choice);

  const result = {
    agent: "SoloForge Content Gatekeeper",
    decision: gate.choice,
    confidence: gate.confidence ?? null,
    probabilities: gate.probabilities ?? null,
    action: action.action,
    next_step: action.nextStep,
    jev: {
      model: decision.model ?? "jev",
      provider: decision.provider ?? null,
      decision_id: decision.id ?? null,
      usage: decision.usage ?? null,
    },
  };

  if (body?.stream === true) {
    return pollinations("/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-5.4-nano",
        input:
          "Return the following JSON object exactly, with no markdown and no extra commentary:\n" +
          JSON.stringify(result),
        stream: true,
        max_output_tokens: 300,
      }),
    });
  }

  return Response.json(result);
}
