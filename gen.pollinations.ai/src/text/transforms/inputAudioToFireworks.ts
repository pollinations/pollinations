import type {
    ChatMessage,
    TransformOptions,
    TransformResult,
} from "../types.js";

/** Convert OpenAI input_audio parts to Fireworks' audio_url request shape. */
export function inputAudioToFireworks(
    messages: ChatMessage[],
    options: TransformOptions,
): TransformResult {
    return {
        messages: messages.map((message) => {
            if (!Array.isArray(message.content)) return message;

            const content = message.content.map((part) => {
                const record = part as Record<string, unknown> | null;
                const inputAudio = record?.input_audio as
                    | Record<string, unknown>
                    | undefined;
                const data = inputAudio?.data;
                const format = inputAudio?.format;
                if (
                    record?.type !== "input_audio" ||
                    typeof data !== "string" ||
                    typeof format !== "string"
                ) {
                    return part;
                }
                return {
                    type: "audio_url",
                    audio_url: {
                        url: `data:audio/${format === "opus" ? "ogg" : format};base64,${data}`,
                    },
                };
            });

            return { ...message, content };
        }),
        options,
    };
}
