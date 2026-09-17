import { ensureUpstreamOk } from "@shared/error.ts";
import type {
    ChatCompletion,
    ChatMessage,
    ServiceError,
    TransformOptions,
} from "./types.js";
import { isPlainObject } from "./utils/objectCleaners.js";

const DOCS_URL = "https://gen.pollinations.ai/docs#tag/text";
const FORMAT_EXAMPLE =
    '{"response_format":{"type":"json_schema","json_schema":{"name":"decision","schema":{"type":"object","properties":{"urgent":{"type":"number","minimum":0,"maximum":1}}}}}}';
const PROPERTY_EXAMPLES =
    'choice: {"type":"string","enum":["billing","technical"]}; score: {"type":"integer","enum":["Calm","Frustrated"]}; noul: {"type":"number","minimum":0,"maximum":1}';

type Question =
    | { type: "choice"; instructions: string; criteria: Record<string, string> }
    | { type: "score"; instructions: string; criteria: string[] }
    | { type: "noul"; instructions: string };
type Answer =
    | {
          type: "choice";
          choice: string;
          confidence: number;
          probabilities: Record<string, number>;
      }
    | {
          type: "score";
          score: number;
          legend: Record<string, string>;
          confidence: number;
          probabilities: Record<string, number>;
      }
    | { type: "noul"; noul: number };
type SystemOneResponse = {
    model: string;
    answers: Record<string, Answer>;
    usage: { input_tokens: number; output_tokens: number };
};

function serviceError(message: string, status: number): ServiceError {
    const error = new Error(message) as ServiceError;
    error.status = status;
    return error;
}

export async function callSystemOne(
    messages: ChatMessage[],
    options: TransformOptions,
): Promise<ChatCompletion> {
    if (options.stream === true) {
        throw serviceError("openjev does not support streaming.", 400);
    }
    const apiKey = options.modelConfig?.["typesafe-api-key"];
    if (typeof apiKey !== "string" || !apiKey) {
        throw serviceError(
            "TypeSafe credentials are not configured for openjev.",
            500,
        );
    }
    const model = options.modelConfig?.model;
    const format = options.response_format;
    if (format?.type !== "json_schema") {
        throw serviceError(
            `openjev requires response_format.type to be "json_schema"; received ${JSON.stringify(format?.type) ?? "missing"}. Minimal request shape: ${FORMAT_EXAMPLE}. Full example: ${DOCS_URL}`,
            400,
        );
    }
    const jsonSchema = format.json_schema;
    const schema = isPlainObject(jsonSchema) ? jsonSchema.schema : undefined;
    const properties = isPlainObject(schema) ? schema.properties : undefined;
    if (!isPlainObject(properties)) {
        throw serviceError(
            `openjev requires response_format.json_schema.schema.properties to be an object, not missing, null, an array, or a scalar. Minimal request shape: ${FORMAT_EXAMPLE}. Full example: ${DOCS_URL}`,
            400,
        );
    }
    const questions = Object.fromEntries(
        Object.entries(properties).map(
            ([name, property]): [string, Question] => {
                if (isPlainObject(property)) {
                    const instructions =
                        typeof property.description === "string"
                            ? property.description
                            : "";
                    const numeric =
                        property.type === "number" ||
                        property.type === "integer";
                    const labels = property.enum;
                    if (
                        Array.isArray(labels) &&
                        labels.length > 0 &&
                        labels.every(
                            (label): label is string =>
                                typeof label === "string",
                        )
                    ) {
                        if (property.type === "string") {
                            return [
                                name,
                                {
                                    type: "choice",
                                    instructions,
                                    criteria: Object.fromEntries(
                                        labels.map((label) => [label, label]),
                                    ),
                                },
                            ];
                        }
                        if (numeric && labels.length >= 2) {
                            return [
                                name,
                                {
                                    type: "score",
                                    instructions,
                                    criteria: labels,
                                },
                            ];
                        }
                    }
                    if (
                        numeric &&
                        property.enum === undefined &&
                        property.minimum === 0 &&
                        property.maximum === 1
                    ) {
                        return [name, { type: "noul", instructions }];
                    }
                }
                throw serviceError(
                    `openjev cannot infer a question type for property ${JSON.stringify(name)} from ${JSON.stringify(property)}. Use ${PROPERTY_EXAMPLES}. Choice needs a non-empty string enum; score needs at least two ordered string labels. Full example: ${DOCS_URL}`,
                    400,
                );
            },
        ),
    );
    const state = messages
        .flatMap(({ content }) =>
            Array.isArray(content)
                ? content.map((part) =>
                      isPlainObject(part) && part.type === "text"
                          ? part.text
                          : "",
                  )
                : [content],
        )
        .filter(Boolean)
        .join("\n\n");
    const requestUrl = new URL("https://api.typesafe.ai/v1/systemone");
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
                "TypeSafe returned a response without valid answers or usage.",
                502,
            );
        }
        const answers = Object.fromEntries(
            Object.entries(result.answers).map(([name, answer]) => {
                switch (answer.type) {
                    case "choice":
                        return [
                            name,
                            {
                                choice: answer.choice,
                                confidence: answer.confidence,
                                probabilities: answer.probabilities,
                            },
                        ];
                    case "score":
                        return [
                            name,
                            {
                                score: answer.score,
                                legend: answer.legend,
                                confidence: answer.confidence,
                                probabilities: answer.probabilities,
                            },
                        ];
                    case "noul":
                        return [name, { noul: answer.noul }];
                    default:
                        throw serviceError(
                            `TypeSafe returned an unsupported answer type for ${JSON.stringify(name)}.`,
                            502,
                        );
                }
            }),
        );
        return {
            id: `systemone-${crypto.randomUUID()}`,
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model: result.model,
            choices: [
                {
                    index: 0,
                    message: {
                        role: "assistant",
                        content: JSON.stringify(answers),
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
            upstreamRequestUrl: requestUrl,
        };
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
