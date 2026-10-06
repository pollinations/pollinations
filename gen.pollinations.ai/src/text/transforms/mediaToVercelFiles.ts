import type { TransformFn } from "../types.ts";
import { inputAudioToFireworks } from "./inputAudioToFireworks.ts";

/** Vercel Chat Completions carries audio and video as file attachments. */
export const mediaToVercelFiles: TransformFn = (messages, options) => ({
    messages: inputAudioToFireworks(messages, options).messages.map(
        (message) => {
            if (!Array.isArray(message.content)) return message;
            return {
                ...message,
                content: message.content.map((part) => {
                    const media = part as {
                        type?: string;
                        audio_url?: { url: string };
                        video_url?: { url: string; mime_type?: string };
                    } | null;
                    const url =
                        media?.type === "audio_url"
                            ? media.audio_url?.url
                            : media?.type === "video_url"
                              ? media.video_url?.url
                              : undefined;
                    if (!url) return part;
                    return {
                        type: "file",
                        file: {
                            file_data: url,
                            filename:
                                media?.type === "video_url"
                                    ? "video.mp4"
                                    : "audio.wav",
                        },
                    };
                }),
            };
        },
    ),
    options,
});
