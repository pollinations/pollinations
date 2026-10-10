import { UpstreamError } from "@shared/error.ts";
import { readResponseBytes } from "@shared/response-bytes.ts";
import { validateUserMediaUrl } from "@shared/user-media-url.ts";
import debug from "debug";
import { arrayBufferToBase64 } from "@/util.ts";
import type { ChatMessage, TransformFn } from "../types.js";

const log = debug("pollinations:transforms:fileData");

/** Max bytes for one inline PDF, matching the image cap. */
export const MAX_FILE_SIZE = 20 * 1024 * 1024;

/** Only PDF documents are supported inline today. */
export const PDF_MIME_TYPE = "application/pdf";

type FilePart = {
    type?: unknown;
    file?: {
        file_data?: unknown;
        file_url?: unknown;
        file_name?: unknown;
        mime_type?: unknown;
        [key: string]: unknown;
    };
    [key: string]: unknown;
};

/** Whether any message content array carries a `file` part. */
export function hasChatFileParts(messages: ChatMessage[]): boolean {
    return messages.some((message) =>
        Array.isArray(message.content)
            ? message.content.some(
                  (part) =>
                      part &&
                      typeof part === "object" &&
                      (part as FilePart).type === "file",
              )
            : false,
    );
}

function fileError(message: string): UpstreamError {
    return new UpstreamError(400, { message });
}

/** Splits a data URL into its media type and base64 payload. */
function parseDataUrl(
    value: string,
): { mimeType: string | undefined; base64: string } | null {
    if (!value.startsWith("data:")) return null;
    const match = /^data:([^;,]*)(?:;([^,]*))?,(.*)$/s.exec(value);
    if (!match) return null;
    return {
        mimeType: match[1] || undefined,
        base64: match[3] ?? "",
    };
}

function mimeTypeFromDataUrl(dataUrl: string): string | undefined {
    return parseDataUrl(dataUrl)?.mimeType;
}

/** The media type of a file part, from an explicit mime_type or a data URL. */
function fileMimeType(part: FilePart): string | undefined {
    const file = part.file ?? {};
    if (typeof file.mime_type === "string" && file.mime_type) {
        return file.mime_type;
    }
    if (typeof file.file_data === "string") {
        return mimeTypeFromDataUrl(file.file_data);
    }
    return undefined;
}

/** Media type of downloaded bytes: content-type header, else the PDF magic. */
function detectMimeType(contentType: string | null, bytes: Uint8Array): string {
    if (contentType?.trim()) return contentType.split(";")[0].trim();
    // PDF files start with "%PDF-"; browsers omit the content type often.
    if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50) {
        return PDF_MIME_TYPE;
    }
    return PDF_MIME_TYPE;
}

/**
 * Downloads one file URL. Redirects are refused like image conversion:
 * a redirect lands on a host the URL guard never saw.
 */
async function fetchFileAsBase64(
    url: string,
    maxBytes: number,
): Promise<{ mimeType: string; base64: string }> {
    const validation = validateUserMediaUrl(url);
    if (!validation.ok) {
        throw fileError(
            `Invalid file URL ${url}: expected a valid public HTTP(S) URL.`,
        );
    }
    let response: Response;
    try {
        response = await fetch(validation.url, {
            redirect: "manual",
            signal: fetchTimeoutSignal(),
        });
    } catch (cause) {
        const error = fileError(`Failed to fetch file from ${url}.`);
        (error as UpstreamError & { cause?: unknown }).cause = cause;
        throw error;
    }
    if (!response.ok) {
        throw fileError(
            `Failed to fetch file from ${url}: HTTP ${response.status} ${response.statusText || "Unknown"}`,
        );
    }
    const bytes = await readResponseBytes(response, maxBytes, (total) =>
        fileError(
            `File from ${url} is too large (max ${maxBytes} bytes, got ${total}).`,
        ),
    );
    const mimeType = detectMimeType(
        response.headers.get("content-type"),
        bytes,
    );
    const base64 = arrayBufferToBase64(bytes);
    log(`Downloaded file as base64: ${mimeType}, ${base64.length} chars`);
    return { mimeType, base64 };
}

/** Abandon slow downloads instead of stalling the whole request. */
function fetchTimeoutSignal(): AbortSignal {
    return AbortSignal.timeout(30_000);
}

interface NormalizationContext {
    format: "base64" | "data-url";
    totalBytes: number;
    maxBytes: number;
}

/**
 * Normalizes one `file` part so it carries inline data the target upstream
 * accepts: Bedrock needs bare base64 in `file_data`, the Responses API needs
 * a base64 data URL.
 */
async function normalizeFilePart(
    part: FilePart,
    context: NormalizationContext,
): Promise<FilePart> {
    const file = part.file ?? {};
    let mimeType = fileMimeType(part);
    let base64: string | undefined;
    let sourceUrl: string | undefined;

    if (typeof file.file_data === "string" && file.file_data) {
        const dataUrl = parseDataUrl(file.file_data);
        if (dataUrl) {
            base64 = dataUrl.base64;
            mimeType = mimeType ?? dataUrl.mimeType;
        } else {
            // Already bare base64.
            base64 = file.file_data;
        }
    } else if (typeof file.file_url === "string" && file.file_url) {
        sourceUrl = file.file_url;
    } else {
        throw fileError("Chat file content requires file_data or file_url.");
    }

    if (sourceUrl) {
        const remaining = context.maxBytes - context.totalBytes;
        if (remaining <= 0) {
            throw fileError(
                `Too many file bytes in request (max ${context.maxBytes}).`,
            );
        }
        const fetched = await fetchFileAsBase64(sourceUrl, remaining);
        context.totalBytes += fetched.base64.length * (3 / 4);
        base64 = fetched.base64;
        mimeType = mimeType ?? fetched.mimeType;
    }

    // Bare base64 without a media type defaults to PDF, like the gateway.
    mimeType = mimeType ?? PDF_MIME_TYPE;
    if (mimeType !== PDF_MIME_TYPE) {
        throw fileError(
            `Unsupported file type: ${mimeType ?? "unknown"}. Only ${PDF_MIME_TYPE} documents are supported inline.`,
        );
    }
    if (!base64) {
        throw fileError("Chat file content has empty file_data.");
    }

    const fileData =
        context.format === "data-url"
            ? `data:${mimeType};base64,${base64}`
            : base64;

    const normalized: FilePart = {
        ...part,
        file: {
            ...file,
            file_data: fileData,
            mime_type: mimeType,
            // URL sources must not survive normalization; the data is inline now.
            ...(sourceUrl ? { file_url: undefined } : {}),
            ...(typeof file.file_name === "string" && file.file_name
                ? { file_name: file.file_name }
                : {}),
        },
    };
    // Keep the wire shape clean: undefined values drop on JSON serialization,
    // but delete anyway so provider transforms never see them.
    if (sourceUrl) delete (normalized.file as Record<string, unknown>).file_url;
    return normalized;
}

/**
 * Inlines every `file` content part: data URLs are decoded to the target
 * format and HTTP(S) `file_url`s are downloaded and encoded. Only PDF
 * documents are accepted; anything else fails with a caller-facing 400.
 */
export async function inlineChatFileData(
    messages: ChatMessage[],
    format: "base64" | "data-url",
    maxBytes = MAX_FILE_SIZE,
): Promise<ChatMessage[]> {
    if (!hasChatFileParts(messages)) return messages;

    const context: NormalizationContext = { format, totalBytes: 0, maxBytes };
    const result: ChatMessage[] = [];
    for (const message of messages) {
        if (!Array.isArray(message.content)) {
            result.push(message);
            continue;
        }
        const content: unknown[] = [];
        for (const part of message.content) {
            if (
                part &&
                typeof part === "object" &&
                (part as FilePart).type === "file"
            ) {
                content.push(
                    await normalizeFilePart(part as FilePart, context),
                );
            } else {
                content.push(part);
            }
        }
        result.push({ ...message, content });
    }
    return result;
}

/**
 * Converts chat file parts to bare base64 `file_data` for providers whose
 * document blocks take raw bytes (AWS Bedrock Converse), enabled by the
 * model config flag `inlineFileData: "base64"`.
 */
export const fileDataTransform: TransformFn = async (messages, options) => {
    const config = options?.modelConfig as Record<string, unknown> | undefined;
    if (config?.inlineFileData !== "base64") {
        return { messages, options };
    }
    const inlineMessages = await inlineChatFileData(messages, "base64");
    return { messages: inlineMessages, options };
};
