import type {
    ChatMessage,
    TransformFn,
    TransformOptions,
    TransformResult,
} from "../types.js";

/**
 * Creates a transform that prepends a system message, merging with any existing system messages.
 */
export function createMessageTransform(systemMessage: string): TransformFn {
    if (!systemMessage || typeof systemMessage !== "string") {
        throw new Error("systemMessage must be a non-empty string");
    }

    return function transform(
        messages: ChatMessage[],
        options: TransformOptions,
    ): TransformResult {
        if (!Array.isArray(messages)) {
            throw new Error("messages must be an array");
        }
        if (!options || typeof options !== "object") {
            throw new Error("options must be an object");
        }

        const existingSystemContent = messages
            .filter((msg) => msg.role === "system")
            .map((msg) =>
                Array.isArray(msg.content)
                    ? msg.content
                          .flatMap((part) =>
                              part &&
                              typeof part === "object" &&
                              "type" in part &&
                              part.type === "text" &&
                              "text" in part &&
                              typeof part.text === "string"
                                  ? [part.text]
                                  : [],
                          )
                          .join("\n")
                    : String(msg.content || ""),
            )
            .join("\n\n");

        const nonSystemMessages = messages.filter(
            (msg) => msg.role !== "system",
        );

        const finalSystemContent = existingSystemContent
            ? `${systemMessage}\n\n${existingSystemContent}`
            : systemMessage;

        return {
            messages: [
                { role: "system", content: finalSystemContent },
                ...nonSystemMessages,
            ],
            options,
        };
    };
}
