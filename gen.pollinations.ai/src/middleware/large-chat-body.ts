import { createHmac } from "node:crypto";
import {
    getRegistryModelDefinition,
    resolveModelName,
} from "@shared/registry/registry.ts";
import { JSONParser } from "@streamparser/json";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env.ts";

export const MAX_LARGE_CHAT_BODY = 100 * 1024 * 1024;
const EXISTING_CHAT_BODY_LIMIT = 32 * 1024 * 1024;
// Validation, caching and the 32 MiB coordinator RPC each copy the compact body.
const MAX_REWRITTEN_BODY = 16 * 1024 * 1024;
const MAX_MEDIA_DATA_URL = 20 * 1024 * 1024;
const MAX_UNOFFLOADED_BYTES = MAX_REWRITTEN_BODY + MAX_MEDIA_DATA_URL;
const PARSE_CHUNK_SIZE = 64 * 1024;

type InlineMedia = {
    type: "image_url" | "video_url" | "file";
    container: Record<string, unknown>;
    field: string;
    dataUrl: string;
    removeField?: string;
};

function inlineMedia(value: unknown): InlineMedia | undefined {
    if (typeof value !== "object" || value === null || !("type" in value))
        return;
    const record = value as Record<string, unknown>;
    const type = record.type;
    if (type !== "image_url" && type !== "video_url" && type !== "file") return;
    const container = record[type];
    if (typeof container !== "object" || container === null) return;
    if (type === "file") {
        const file = container as Record<string, unknown>;
        const data = file.file_data;
        if (
            typeof data === "string" &&
            data.length > 0 &&
            file.file_url === undefined
        ) {
            const dataUrl = data.startsWith("data:")
                ? data
                : file.mime_type === "application/pdf"
                  ? `data:application/pdf;base64,${data}`
                  : undefined;
            if (dataUrl?.startsWith("data:application/pdf;base64,")) {
                return {
                    type,
                    container: file,
                    field: "file_url",
                    dataUrl,
                    removeField: "file_data",
                };
            }
        }
    }
    const field = type === "file" ? "file_url" : "url";
    const dataUrl = (container as Record<string, unknown>)[field];
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) return;
    return {
        type,
        container: container as Record<string, unknown>,
        field,
        dataUrl,
    };
}

export async function readLargeChatBody(
    stream: ReadableStream<Uint8Array>,
    uploadMedia: (
        dataUrl: string,
        type: InlineMedia["type"],
    ) => Promise<string>,
): Promise<string> {
    const parser = new JSONParser({
        paths: ["$.messages.*.content.*", "$"],
    });
    const pending: InlineMedia[] = [];
    let parsed: unknown;
    let totalBytes = 0;
    let parsedBytes = 0;
    let offloadedBytes = 0;
    let offloadedFileData = false;

    parser.onValue = ({ value, stack }) => {
        if (stack.length === 0) {
            parsed = value;
            return;
        }
        const media = inlineMedia(value);
        if (!media) return;
        if (media.dataUrl.length > MAX_MEDIA_DATA_URL) {
            throw new HTTPException(413, {
                message: "An inline media item exceeds the 20 MiB limit",
            });
        }
        media.container[media.field] = "";
        if (media.removeField) {
            delete media.container[media.removeField];
            offloadedFileData = true;
        }
        pending.push(media);
    };

    const reader = stream.getReader();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            totalBytes += value.byteLength;
            if (totalBytes > MAX_LARGE_CHAT_BODY) {
                throw new HTTPException(413, {
                    message: "Request body exceeds the 100 MiB limit",
                });
            }
            for (
                let offset = 0;
                offset < value.length;
                offset += PARSE_CHUNK_SIZE
            ) {
                const chunk = value.subarray(offset, offset + PARSE_CHUNK_SIZE);
                parsedBytes += chunk.byteLength;
                try {
                    parser.write(chunk);
                } catch (error) {
                    if (error instanceof HTTPException) throw error;
                    throw new HTTPException(400, {
                        message: "Invalid JSON body",
                    });
                }
                for (const {
                    type,
                    container,
                    field,
                    dataUrl,
                } of pending.splice(0)) {
                    container[field] = await uploadMedia(dataUrl, type);
                    offloadedBytes += dataUrl.length;
                }
                if (parsedBytes - offloadedBytes > MAX_UNOFFLOADED_BYTES) {
                    throw new HTTPException(413, {
                        message: "Request body exceeds the 32 MiB limit",
                    });
                }
            }
        }
    } finally {
        reader.releaseLock();
    }

    if (!parser.isEnded || typeof parsed !== "object" || parsed === null) {
        throw new HTTPException(400, { message: "Invalid JSON body" });
    }
    if (offloadedFileData) {
        const model = (parsed as Record<string, unknown>).model;
        let provider: string | undefined;
        if (typeof model === "string") {
            try {
                provider = getRegistryModelDefinition(
                    resolveModelName(model),
                ).provider;
            } catch {
                // The normal model resolver reports an unknown model.
            }
        }
        if (provider !== "openrouter") {
            throw new HTTPException(413, {
                message:
                    "Large inline PDF file_data requires an OpenRouter model",
            });
        }
    }
    const body = JSON.stringify(parsed);
    if (body.length > MAX_REWRITTEN_BODY) {
        throw new HTTPException(413, {
            message:
                offloadedBytes > 0
                    ? "Chat content exceeds the 16 MiB limit after media offload"
                    : "Request body exceeds the 32 MiB limit",
        });
    }
    return body;
}

/** Large inline media become URLs before Hono or the provider constructs another JSON copy. */
export const largeChatBody = createMiddleware<Env>(async (c, next) => {
    const contentLength = Number(c.req.header("content-length"));
    if (
        !Number.isFinite(contentLength) ||
        contentLength <= EXISTING_CHAT_BODY_LIMIT
    ) {
        return next();
    }
    if (contentLength > MAX_LARGE_CHAT_BODY) {
        throw new HTTPException(413, {
            message: "Request body exceeds the 100 MiB limit",
        });
    }
    const stream = c.req.raw.body;
    if (!stream) return next();

    const body = await readLargeChatBody(stream, async (dataUrl, type) => {
        const user = c.var.auth.requireUser();
        const match =
            /^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
                dataUrl,
            );
        if (!match) {
            throw new HTTPException(400, {
                message: "Invalid inline media data URL",
            });
        }
        if (
            (type === "image_url" &&
                !/^image\/(?:jpeg|png|webp|gif)$/.test(match[1])) ||
            (type === "video_url" && !match[1].startsWith("video/"))
        ) {
            throw new HTTPException(400, {
                message: "Invalid inline media data URL",
            });
        }
        const bytes = Buffer.from(match[2], "base64");
        const id = createHmac("sha256", c.env.BETTER_AUTH_SECRET)
            .update("chat-input\0")
            .update(user.id)
            .update("\0")
            .update(match[1])
            .update("\0")
            .update(bytes)
            .digest("hex");
        if (await c.env.MEDIA.has(id)) {
            return `https://media.pollinations.ai/${id}`;
        }
        const upload = await c.env.MEDIA.upload(new Blob([bytes]).stream(), {
            id,
            contentType: match[1],
            size: bytes.byteLength,
            uploadedBy: user.id,
            keyType: "chat-input",
        });
        return upload.url;
    });

    const headers = new Headers(c.req.raw.headers);
    headers.set(
        "content-length",
        String(new TextEncoder().encode(body).byteLength),
    );
    c.req.raw = new Request(c.req.raw, { body, headers });
    await next();
});
