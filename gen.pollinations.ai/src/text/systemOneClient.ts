import { ensureUpstreamOk } from "@shared/error.ts";
import { completionToChatStream } from "./chat/stream.js";
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

type SystemOneResponse = {
    model: string;
    answers: Record<string, unknown>;
    usage: { input_tokens: number; output_tokens: number };
};

type SystemOneRequest = {
    state: unknown;
    questions: Record<string, unknown>;
};

function decisionText(value: unknown): string {
    return typeof value === "string" ? value : JSON.stringify(value);
}

function toOpenAIQuestions(questions: Record<string, unknown>) {
    return Object.entries(questions).map(([name, question]) => {
        if (!isPlainObject(question))
            throw nativeRequestError("Invalid question.");
        const instructions = decisionText(question.instructions);
        if (question.type === "noul") {
            return {
                name,
                type: "predicate",
                instructions: question.criteria
                    ? `${instructions}\n${decisionText(question.criteria)}`
                    : instructions,
            };
        }
        if (question.type === "choice" && isPlainObject(question.criteria)) {
            return {
                name,
                type: "choice",
                instructions,
                choices: Object.entries(question.criteria).map(
                    ([value, description]) => ({
                        value,
                        ...(description === null
                            ? {}
                            : { description: decisionText(description) }),
                    }),
                ),
            };
        }
        if (question.type === "score" && Array.isArray(question.criteria)) {
            return {
                name,
                type: "score",
                instructions,
                levels: question.criteria.map((description, index) => ({
                    label: String(index),
                    description: decisionText(description),
                })),
            };
        }
        throw nativeRequestError("Unsupported decision question.");
    });
}

function fromOpenAIResponse(
    body: unknown,
    questions: Record<string, unknown>,
): SystemOneResponse {
    if (!isPlainObject(body) || !Array.isArray(body.answers)) {
        throw serviceError("OpenAI returned invalid decision answers.", 502);
    }
    const answers = Object.fromEntries(
        body.answers.map((entry) => {
            if (!isPlainObject(entry) || typeof entry.name !== "string") {
                throw serviceError(
                    "OpenAI returned an invalid decision answer.",
                    502,
                );
            }
            const { name, type, ...answer } = entry;
            if (type === "predicate")
                return [name, { type: "noul", noul: answer.probability }];
            const question = questions[name];
            return [
                name,
                {
                    ...answer,
                    type,
                    ...(Array.isArray(answer.probabilities) && {
                        probabilities: Object.fromEntries(
                            answer.probabilities.map((probability) => {
                                if (!isPlainObject(probability))
                                    throw serviceError(
                                        "OpenAI returned invalid probabilities.",
                                        502,
                                    );
                                return [
                                    String(probability.value),
                                    probability.probability,
                                ];
                            }),
                        ),
                    }),
                    ...(type === "score" &&
                        isPlainObject(question) &&
                        Array.isArray(question.criteria) && {
                            legend: Object.fromEntries(
                                question.criteria.map((criterion, index) => [
                                    String(index),
                                    criterion,
                                ]),
                            ),
                        }),
                },
            ];
        }),
    );
    if (!Object.keys(questions).every((name) => Object.hasOwn(answers, name))) {
        throw serviceError("OpenAI returned incomplete decision answers.", 502);
    }
    return {
        model: body.model,
        answers,
        usage: body.usage,
    } as SystemOneResponse;
}

function serviceError(message: string, status: number): ServiceError {
    const error = new Error(message) as ServiceError;
    error.status = status;
    return error;
}

function nativeRequestError(detail: string): ServiceError {
    return serviceError(
        `${detail} The last user message's content must be the native TypeSafe request as JSON: ${REQUEST_EXAMPLE}. Docs: ${DOCS_URL}`,
        400,
    );
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
        );
    }
    let payload: unknown;
    try {
        payload = JSON.parse(message.content);
    } catch {
        throw nativeRequestError(
            `${model} could not parse the user message content as JSON.`,
        );
    }
    if (
        !isPlainObject(payload) ||
        payload.state === undefined ||
        !isPlainObject(payload.questions)
    ) {
        throw nativeRequestError(
            `${model} expects a JSON object with "state" and a "questions" map.`,
        );
    }
    return { state: payload.state, questions: payload.questions };
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
    const openai = options.modelConfig?.decisionsProtocol === "openai";
    const requestUrl = new URL(endpoint);
    try {
        const response = await fetch(requestUrl, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(
                openai
                    ? {
                          model,
                          input: decisionText(state),
                          questions: toOpenAIQuestions(questions),
                      }
                    : { state, model, questions },
            ),
        });
        await ensureUpstreamOk(response, requestUrl);
        const body = await response.json();
        const result = openai
            ? fromOpenAIResponse(body, questions)
            : (body as SystemOneResponse);
        // Billable responses must carry usage; reject rather than bill zero.
        if (
            !isPlainObject(result?.answers) ||
            ![result?.usage?.input_tokens, result?.usage?.output_tokens].every(
                (count) =>
                    typeof count === "number" &&
                    Number.isSafeInteger(count) &&
                    count >= 0,
            )
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
        error.status ??= 502;
        error.requestUrl = requestUrl;
        throw error;
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
        // TypeSafe answers arrive in one piece.
        options.stream ? completionToChatStream(completion) : completion,
        requestUrl,
    );
}
