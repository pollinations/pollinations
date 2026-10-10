import { UpstreamError } from "@shared/error.ts";
import { fetchUserImage, MAX_IMAGE_SIZE } from "../../userImage.ts";
import { arrayBufferToBase64 } from "../../util.ts";
import type { TransformFn } from "../types.ts";

/**
 * Video MIME types as the Portkey Bedrock adapter names them: it turns a
 * `file` part into a Converse `video` block only for these, using the subtype
 * as the Converse `format`. Standard names map onto them.
 */
const BEDROCK_VIDEO_TYPES: Record<string, string> = {
    "video/mp4": "video/mp4",
    "video/quicktime": "video/mov",
    "video/mov": "video/mov",
    "video/x-matroska": "video/mkv",
    "video/mkv": "video/mkv",
    "video/webm": "video/webm",
    "video/x-flv": "video/flv",
    "video/flv": "video/flv",
    "video/mpeg": "video/mpeg",
    "video/mpg": "video/mpg",
    "video/x-ms-wmv": "video/wmv",
    "video/wmv": "video/wmv",
};

function badRequest(message: string): never {
    throw new UpstreamError(400, { message });
}

type VideoPart = {
    type: "video_url";
    video_url: { url: string; mime_type?: string };
};

async function videoToFile(part: VideoPart, budget: { bytes: number }) {
    const { url, mime_type } = part.video_url;
    const { bytes, mimeType } = await fetchUserImage(url, {
        maxBytes: budget.bytes,
        redirect: "manual",
    });
    budget.bytes -= bytes.byteLength;
    const declared = (mime_type ?? mimeType).split(";")[0].trim().toLowerCase();
    const bedrockType = BEDROCK_VIDEO_TYPES[declared];
    if (!bedrockType) {
        badRequest(
            `Unsupported video format ${declared}: expected MP4, MOV, MKV, WebM, FLV, MPEG or WMV.`,
        );
    }
    return {
        type: "file",
        file: { file_data: arrayBufferToBase64(bytes), mime_type: bedrockType },
    };
}

/**
 * Bedrock Converse takes video as inline bytes, which Portkey builds from a
 * `file` part. Without this, `video_url` parts are dropped on the way and the
 * model answers as if no video was sent. The gateway's Bedrock adapter has no
 * audio mapping, so audio is refused instead of being dropped the same way.
 */
export const mediaToBedrock: TransformFn = async (messages, options) => {
    const budget = { bytes: MAX_IMAGE_SIZE };
    const processed = [];
    for (const message of messages) {
        if (!Array.isArray(message.content)) {
            processed.push(message);
            continue;
        }
        const content = [];
        for (const part of message.content) {
            const type = (part as { type?: string } | null)?.type;
            if (type === "input_audio") {
                badRequest(
                    "This model does not support audio input. Use a model with audio in its input_modalities.",
                );
            }
            content.push(
                type === "video_url"
                    ? await videoToFile(part as VideoPart, budget)
                    : part,
            );
        }
        processed.push({ ...message, content });
    }
    return { messages: processed, options };
};
