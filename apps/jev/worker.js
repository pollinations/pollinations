// OpenAI-compatible front end for TypeSafe's System One API, registered as a
// community model. TypeSafe's native request is JSON in the last user message
// and its native answers come back as the assistant content.
const TYPESAFE_URL = "https://api.typesafe.ai/v1/systemone";
const DOCS_URL = "https://docs.typesafe.ai/api";
const DEFAULT_MODEL = "jev-latest";
const REQUEST_TIMEOUT_MS = 30_000;
const REQUEST_EXAMPLE =
    '{"state":"My payouts have been failing for 3 days.","questions":{"department":{"type":"choice","instructions":"Which team should handle this?","criteria":{"billing":"Payment issues","technical":"Product failures"}},"is_urgent":{"type":"noul","instructions":"Does this convey urgency?"}}}';

class RequestError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

function errorResponse(status, message) {
    return Response.json(
        {
            error: {
                message,
                type: status >= 500 ? "server_error" : "invalid_request_error",
            },
        },
        { status },
    );
}

function nativeRequestError(detail) {
    return new RequestError(
        400,
        `${detail} The last user message's content must be the native TypeSafe request as JSON: ${REQUEST_EXAMPLE}. Docs: ${DOCS_URL}`,
    );
}

function parseNativeRequest(messages) {
    const message = Array.isArray(messages)
        ? messages.findLast((item) => item?.role === "user")
        : undefined;
    if (typeof message?.content !== "string") {
        throw nativeRequestError(
            "A user message with string content is required.",
        );
    }
    let payload;
    try {
        payload = JSON.parse(message.content);
    } catch {
        throw nativeRequestError("The user message content is not JSON.");
    }
    if (
        typeof payload !== "object" ||
        payload === null ||
        Array.isArray(payload) ||
        payload.state === undefined ||
        typeof payload.questions !== "object" ||
        payload.questions === null ||
        Array.isArray(payload.questions)
    ) {
        throw nativeRequestError(
            'A JSON object with "state" and a "questions" map is required.',
        );
    }
    return { state: payload.state, questions: payload.questions };
}

async function callTypeSafe({ state, questions, model }, apiKey) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
        response = await fetch(TYPESAFE_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ state, model, questions }),
            signal: controller.signal,
        });
    } catch (error) {
        throw new RequestError(
            controller.signal.aborted ? 504 : 502,
            `TypeSafe request failed: ${error.message}`,
        );
    } finally {
        clearTimeout(timeout);
    }
    if (!response.ok) {
        throw new RequestError(
            response.status,
            (await response.text()).slice(0, 1000),
        );
    }
    const result = await response.json();
    // Billing reads usage off this response; reject rather than bill zero.
    if (
        typeof result?.answers !== "object" ||
        result.answers === null ||
        typeof result?.usage?.input_tokens !== "number" ||
        typeof result?.usage?.output_tokens !== "number"
    ) {
        throw new RequestError(
            502,
            "TypeSafe returned no answers or no usage.",
        );
    }
    return result;
}

function toChatCompletion(result) {
    return {
        id: `jev-${crypto.randomUUID()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: result.model,
        choices: [
            {
                index: 0,
                message: {
                    role: "assistant",
                    content: JSON.stringify(result.answers),
                },
                finish_reason: "stop",
            },
        ],
        usage: {
            prompt_tokens: result.usage.input_tokens,
            completion_tokens: result.usage.output_tokens,
            total_tokens:
                result.usage.input_tokens + result.usage.output_tokens,
        },
    };
}

// Answers arrive in one piece, so the stream is the finished completion
// re-emitted as chunks: content, then the usage chunk billing requires.
function streamedResponse(completion) {
    const { id, created, model, choices, usage } = completion;
    const chunk = { id, object: "chat.completion.chunk", created, model };
    const body = [
        {
            ...chunk,
            choices: [
                {
                    index: 0,
                    delta: {
                        role: "assistant",
                        content: choices[0].message.content,
                    },
                    finish_reason: "stop",
                },
            ],
            usage: null,
        },
        { ...chunk, choices: [], usage },
    ]
        .map((event) => `data: ${JSON.stringify(event)}\n\n`)
        .join("");
    return new Response(new Blob([body, "data: [DONE]\n\n"]).stream(), {
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache",
        },
    });
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({ name: "jev", api: "chat_completions" });
        }
        if (url.pathname !== "/v1/chat/completions") {
            return errorResponse(404, "Not found.");
        }
        if (request.method !== "POST") {
            return errorResponse(405, "Use POST.");
        }
        if (!env.JEV_PROXY_TOKEN || !env.TYPESAFE_API_KEY) {
            return errorResponse(
                500,
                "Jev proxy credentials are not configured.",
            );
        }
        if (
            request.headers.get("authorization") !==
            `Bearer ${env.JEV_PROXY_TOKEN}`
        ) {
            return errorResponse(401, "Send the registered bearer token.");
        }

        try {
            const body = await request.json().catch(() => {
                throw new RequestError(400, "The request body is not JSON.");
            });
            const { state, questions } = parseNativeRequest(body.messages);
            const result = await callTypeSafe(
                { state, questions, model: body.model || DEFAULT_MODEL },
                env.TYPESAFE_API_KEY,
            );
            const completion = toChatCompletion(result);
            return body.stream === true
                ? streamedResponse(completion)
                : Response.json(completion);
        } catch (error) {
            if (error instanceof RequestError) {
                return errorResponse(error.status, error.message);
            }
            throw error;
        }
    },
};
