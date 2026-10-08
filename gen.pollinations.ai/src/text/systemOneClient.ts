import { ensureUpstreamOk } from "@shared/error.ts";
import { withUpstreamRequestUrl } from "./genericOpenAIClient.js";
import type {
    ChatCompletion,
    ChatMessage,
    ServiceError,
    TransformOptions,
} from "./types.js";
import { isPlainObject } from "./utils/objectCleaners.js";

const DOCS_URL = "https://docs.typesafe.ai/api";
const REQUEST_EXAMPLE =
    '{"state":"My payouts have been failing for 3 days.","questions":{"department":{"type":"choice","instructions":"Which team should handle this?","criteria":{"billing":"Payment issues","technical":"Product failures"}},"is_urgent":{"type":"noul","instructions":"Does this convey urgency?"}}}';
// Span-01 Lite accepts only noul questions with plain-string instructions, so
// the generic example above (which has a choice) would fail upstream for it.
const NOUL_ONLY_REQUEST_EXAMPLE =
    '{"state":"My payouts have been failing for 3 days.","questions":{"is_urgent":{"type":"noul","instructions":"Does this convey urgency?"}}}';
const NOUL_ONLY_MODELS = new Set(["respan/span-01-lite"]);

function requestExample(model: unknown): string {
    if (typeof model === "string" && NOUL_ONLY_MODELS.has(model)) {
        return `${NOUL_ONLY_REQUEST_EXAMPLE} (${model} accepts only "noul" questions with plain-string instructions)`;
    }
    return REQUEST_EXAMPLE;
}

type SystemOneResponse = {
    model: string;
    answers: Record<string, unknown>;
    usage: { input_tokens: number; output_tokens: number };
};

type SystemOneRequest = {
    state: unknown;
    questions: Record<string, unknown>;
};

function serviceError(message: string, status: number): ServiceError {
    const error = new Error(message) as ServiceError;
    error.status = status;
    return error;
}

function nativeRequestError(detail: string, model: unknown): ServiceError {
    return serviceError(
        `${detail} The last user message's content must be the native TypeSafe request as JSON: ${requestExample(model)}. Docs: ${DOCS_URL}`,
        400,
    );
}

// Chat clients often paste the request as a Markdown block (```json ... ```)
// or carry invisible characters (BOM, zero-width spaces) that JSON.parse
// rejects; strip those around the whole message so the JSON inside parses.
const INVISIBLE_EDGES =
    /^[\s\uFEFF\u200B-\u200D\u2060]+|[\s\uFEFF\u200B-\u200D\u2060]+$/g;

function unwrapNativeJson(content: string): string {
    const trimmed = content.replace(INVISIBLE_EDGES, "");
    const fenced = trimmed.match(/^```[\w-]*[ \t]*\n([\s\S]*?)\n?```$/);
    return fenced ? fenced[1] : trimmed;
}

function parseNativeRequest(
    messages: ChatMessage[],
    model: unknown,
): {
    state: unknown;
    questions: Record<string, unknown>;
} {
    // Like the media models, only the last user message carries the request;
    // earlier turns and system instructions are ignored.
    const message = messages.findLast((item) => item?.role === "user");
    if (typeof message?.content !== "string") {
        throw nativeRequestError(
            `${model} requires a user message with string content.`,
            model,
        );
    }
    let payload: unknown;
    try {
        payload = JSON.parse(unwrapNativeJson(message.content));
    } catch {
        throw nativeRequestError(
            `${model} could not parse the user message content as JSON.`,
            model,
        );
    }
    if (
        !isPlainObject(payload) ||
        payload.state === undefined ||
        !isPlainObject(payload.questions)
    ) {
        throw nativeRequestError(
            `${model} expects a JSON object with "state" and a "questions" map.`,
            model,
        );
    }
    return { state: payload.state, questions: payload.questions };
}

// TypeSafe answers arrive in one piece, so the stream is the finished
// completion re-emitted as chunks: content, then the usage chunk billing
// requires, then the terminator.
function toStreamedCompletion(completion: ChatCompletion): ChatCompletion {
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
                        content: choices?.[0]?.message?.content ?? "",
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
    return {
        ...completion,
        stream: true,
        responseStream: new Blob([body, "data: [DONE]\n\n"]).stream(),
    };
}

/**
 * The single upstream call, shared by the native `/alpha/decisions` route and
 * the chat-completions adapter below. Returns the provider's response along
 * with the URL it came from, which callers attach for error attribution.
 */
export async function requestDecision(
    request: SystemOneRequest,
    options: TransformOptions,
): Promise<{ result: SystemOneResponse; requestUrl: URL }> {
    const { state, questions } = request;
    const apiKey = options.modelConfig?.authKey;
    const endpoint = options.modelConfig?.directEndpoint;
    const model = options.modelConfig?.model;
    if (typeof apiKey !== "string" || !apiKey || typeof endpoint !== "string") {
        throw serviceError(
            `The decisions route is not configured for ${model}.`,
            500,
        );
    }
    const requestUrl = new URL(endpoint);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
        const response = await fetch(requestUrl, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ state, model, questions }),
            signal: controller.signal,
        });
        await ensureUpstreamOk(response, requestUrl);
        const result = (await response.json()) as SystemOneResponse;
        // Billable responses must carry usage; reject rather than bill zero.
        if (
            !isPlainObject(result?.answers) ||
            typeof result?.usage?.input_tokens !== "number" ||
            typeof result?.usage?.output_tokens !== "number"
        ) {
            throw serviceError(
                `${model} returned a response without valid answers or usage.`,
                502,
            );
        }
        return { result, requestUrl };
    } catch (thrown) {
        const error =
            thrown instanceof Error
                ? (thrown as ServiceError)
                : (new Error(String(thrown)) as ServiceError);
        error.status ??= controller.signal.aborted ? 504 : 502;
        error.requestUrl = requestUrl;
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

/**
 * Chat-completions adapter: the native request travels as JSON in the last
 * user message and the answers come back as the assistant's content. Callers
 * that can post the native shape should use `/alpha/decisions` instead.
 */
export async function callSystemOne(
    messages: ChatMessage[],
    options: TransformOptions,
): Promise<ChatCompletion> {
    const { result, requestUrl } = await requestDecision(
        parseNativeRequest(messages, options.modelConfig?.model),
        options,
    );
    const completion: ChatCompletion = {
        id: `systemone-${crypto.randomUUID()}`,
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
    return withUpstreamRequestUrl(
        options.stream ? toStreamedCompletion(completion) : completion,
        requestUrl,
    );
}
