import { withUpstreamRequestUrl } from "../genericOpenAIClient.js";
import type { ChatCompletion } from "../types.js";

/**
 * Replay a finished completion as an OpenAI chat stream: one chunk per choice
 * with the whole message as its delta, the usage chunk billing requires, then
 * the terminator. For upstreams that only answer in one piece.
 */
export function completionToChatStream(
    completion: ChatCompletion,
): ChatCompletion {
    const { id, created, model, choices, usage } = completion;
    const chunk = { id, object: "chat.completion.chunk", created, model };
    const body = [
        ...(choices ?? []).map((choice, index) => {
            const { tool_calls, ...message } = choice.message ?? {
                role: "assistant",
            };
            return {
                ...chunk,
                choices: [
                    {
                        index: choice.index ?? index,
                        delta: {
                            ...message,
                            role: "assistant",
                            content: message.content ?? "",
                            // Stream deltas index each tool call.
                            ...(tool_calls?.length
                                ? {
                                      tool_calls: tool_calls.map((call, i) => ({
                                          index: i,
                                          ...(call as object),
                                      })),
                                  }
                                : {}),
                        },
                        finish_reason: choice.finish_reason ?? "stop",
                    },
                ],
                usage: null,
            };
        }),
        { ...chunk, choices: [], usage },
    ]
        .map((event) => `data: ${JSON.stringify(event)}\n\n`)
        .join("");
    const streamed = {
        ...completion,
        stream: true,
        responseStream: new Blob([body, "data: [DONE]\n\n"]).stream(),
    };
    return completion.upstreamRequestUrl
        ? withUpstreamRequestUrl(streamed, completion.upstreamRequestUrl)
        : streamed;
}
