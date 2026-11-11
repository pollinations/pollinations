import { ensureUpstreamOk } from "@shared/error.ts";
import { CreateDecisionRequestSchema } from "@shared/schemas/decisions.ts";
import {
    type CompletionUsage,
    CompletionUsageSchema,
} from "@shared/schemas/openai.ts";
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
    usage: {
        input_tokens: number;
        output_tokens: number;
        input_tokens_details?: {
            cached_tokens?: number;
            cache_write_tokens?: number;
        };
    };
};

export function decisionCompletionUsage(
    usage: SystemOneResponse["usage"],
): CompletionUsage {
    return {
        prompt_tokens: usage.input_tokens,
        completion_tokens: usage.output_tokens,
        total_tokens: usage.input_tokens + usage.output_tokens,
        ...(usage.input_tokens_details && {
            prompt_tokens_details: usage.input_tokens_details,
        }),
    };
}

type SystemOneRequest = {
    state: unknown;
    questions: Record<string, unknown>;
};

function decisionText(value: unknown): string {
    return typeof value === "string" ? value : JSON.stringify(value);
}

function toD3Request(request: SystemOneRequest): SystemOneRequest {
    const parsed = CreateDecisionRequestSchema.safeParse(request);
    if (!parsed.success) {
        throw serviceError(
            `Invalid decision request: ${parsed.error.message}`,
            400,
        );
    }
    const state = decisionText(parsed.data.state);
    if (
        [...state].length > 32000 ||
        Object.keys(parsed.data.questions).length > 64
    ) {
        throw serviceError(
            "d3 accepts up to 32,000 state characters and 64 questions.",
            400,
        );
    }
    return {
        state,
        questions: Object.fromEntries(
            Object.entries(parsed.data.questions).map(([name, question]) => {
                const criteria = question.criteria;
                if (criteria && question.type !== "noul") {
                    const count = Object.keys(criteria).length;
                    if (count < 2 || count > 255) {
                        throw serviceError(
                            "d3 questions require between 2 and 255 criteria.",
                            400,
                        );
                    }
                }
                return [
                    name,
                    {
                        ...question,
                        instructions: decisionText(question.instructions),
                        ...(criteria && {
                            criteria: Array.isArray(criteria)
                                ? criteria.map(decisionText)
                                : Object.fromEntries(
                                      Object.entries(criteria).map(
                                          ([key, value]) => [
                                              key,
                                              value === null
                                                  ? null
                                                  : decisionText(value),
                                          ],
                                      ),
                                  ),
                        }),
                    },
                ];
            }),
        ),
    };
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
    const d3 = options.modelConfig?.decisionsProtocol === "vllm-sr";
    const requestUrl = new URL(endpoint);
    try {
        const response = await fetch(requestUrl, {
            method: "POST",
            headers: {
                ...(options.modelConfig?.directAuthHeader === "api-key"
                    ? { "api-key": apiKey }
                    : { Authorization: `Bearer ${apiKey}` }),
                "Content-Type": "application/json",
            },
            body: JSON.stringify(
                openai
                    ? {
                          model,
                          input: decisionText(state),
                          questions: toOpenAIQuestions(questions),
                      }
                    : {
                          ...(options.modelConfig?.defaultOptions as
                              | Record<string, unknown>
                              | undefined),
                          ...(d3 ? toD3Request(request) : request),
                          model,
                      },
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
            ) ||
            !CompletionUsageSchema.safeParse(
                decisionCompletionUsage(result.usage),
            ).success
        ) {
            throw serviceError(
                `${model} returned a response without valid answers or usage.`,
                502,
            );
        }
        if (d3) {
            for (const [name, question] of Object.entries(questions)) {
                const answer = result.answers[name];
                if (
                    isPlainObject(question) &&
                    question.type === "score" &&
                    isPlainObject(answer) &&
                    answer.type === "score" &&
                    Array.isArray(question.criteria)
                ) {
                    result.answers[name] = {
                        ...answer,
                        legend: Object.fromEntries(
                            question.criteria.map((criterion, index) => [
                                String(index),
                                criterion,
                            ]),
                        ),
                    };
                }
            }
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
        usage: decisionCompletionUsage(result.usage),
    };
    return withUpstreamRequestUrl(
        // TypeSafe answers arrive in one piece.
        options.stream ? completionToChatStream(completion) : completion,
        requestUrl,
    );
}
