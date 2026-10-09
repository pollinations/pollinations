import { UpstreamError } from "@shared/error.ts";
import type {
    ChatMessage,
    TransformOptions,
    TransformResult,
} from "../types.js";

type JsonObject = Record<string, unknown>;

// data:<mime>(;<param>)*;base64,<payload> - parameters like ;charset=utf-8
// may appear between the MIME type and the base64 marker.
const DATA_URL_PATTERN = /^data:([^;,]+)?(?:;[^;,]+)*;base64,(.*)$/s;
// Bedrock Converse document names: alphanumerics, whitespace, - _ ( ) [ ].
// No periods, so a file extension cannot survive sanitization.
const INVALID_NAME_CHARS = /[^a-zA-Z0-9\s\-_()[\]]/g;

function fileInputError(message: string): UpstreamError {
    return new UpstreamError(400, {
        message,
        errorCode: "unsupported_parameter",
    });
}

function sanitizeDocumentName(value: unknown, fallback: string): string {
    if (typeof value !== "string" || !value.trim()) return fallback;
    const cleaned = value
        .replace(INVALID_NAME_CHARS, " ")
        .replace(/\s+/g, " ")
        .trim();
    return cleaned || fallback;
}

/**
 * Normalizes Chat `file` content parts for Bedrock (via Portkey).
 *
 * Portkey's Bedrock mapping forwards `file.file_data` verbatim as Converse
 * `document.source.bytes`, which must be bare base64 - unlike `image_url`
 * parts, where Portkey strips the data-URL prefix itself. It also requires a
 * document name and falls back to `crypto.randomUUID()` when `file_name` is
 * missing, which would defeat prompt caching; a deterministic positional name
 * keeps identical requests cache-stable, as for images.
 *
 * Only inline base64 PDFs in user messages are accepted: Converse document
 * blocks are user-turn only, cannot fetch http(s) `file_url`s, and take a
 * fixed format enum where only `application/pdf` maps cleanly.
 */
export function normalizeBedrockFileParts(
    messages: ChatMessage[],
    options: TransformOptions,
): TransformResult {
    if (options.modelConfig?.provider !== "bedrock") {
        return { messages, options };
    }

    let documentIndex = 0;
    const normalizePart = (raw: unknown, role: string): unknown => {
        if (
            !raw ||
            typeof raw !== "object" ||
            (raw as JsonObject).type !== "file"
        )
            return raw;
        if (role !== "user") {
            throw fileInputError(
                "File input is only supported in user messages for this model",
            );
        }
        const part = raw as JsonObject;
        const file = part.file;
        if (!file || typeof file !== "object" || Array.isArray(file))
            return raw;
        const fileObject = file as JsonObject;
        if (typeof fileObject.file_data !== "string") {
            throw fileInputError(
                "This model requires inline base64 file_data for file input; file_url and file_id are not supported",
            );
        }

        documentIndex += 1;
        const normalized: JsonObject = { ...fileObject };
        let mimeType =
            typeof fileObject.mime_type === "string"
                ? fileObject.mime_type
                : undefined;
        const dataUrlMatch = DATA_URL_PATTERN.exec(fileObject.file_data);
        if (dataUrlMatch) {
            normalized.file_data = dataUrlMatch[2];
            mimeType ??= dataUrlMatch[1] || undefined;
        } else if (fileObject.file_data.startsWith("data:")) {
            throw fileInputError(
                "Malformed data URL in file_data; expected data:application/pdf;base64,<payload>",
            );
        }
        if (mimeType && mimeType !== "application/pdf") {
            throw fileInputError(
                `This model supports application/pdf file input, not ${mimeType}`,
            );
        }
        normalized.mime_type = "application/pdf";
        normalized.file_name = sanitizeDocumentName(
            normalized.file_name,
            `document-${documentIndex}`,
        );
        return { ...part, file: normalized };
    };

    const normalizedMessages = messages.map((message) => {
        if (!Array.isArray(message.content)) return message;
        return {
            ...message,
            content: message.content.map((part) =>
                normalizePart(part, message.role),
            ),
        } as ChatMessage;
    });

    return { messages: normalizedMessages, options };
}
