import { createHash } from "node:crypto";
import { JSONParser } from "@streamparser/json";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env.ts";

export const MAX_LARGE_CHAT_BODY = 100 * 1024 * 1024;
const EXISTING_CHAT_BODY_LIMIT = 32 * 1024 * 1024;
// The generation coordinator carries this body in a 32 MiB RPC argument.
const MAX_REWRITTEN_BODY = 31 * 1024 * 1024;
const MAX_IMAGE_DATA_URL = 20 * 1024 * 1024;
const MAX_UNOFFLOADED_BYTES = MAX_REWRITTEN_BODY + MAX_IMAGE_DATA_URL;
const PARSE_CHUNK_SIZE = 64 * 1024;

type ImagePart = { type: "image_url"; image_url: { url: string } };

function imagePart(value: unknown): value is ImagePart {
    return (
        typeof value === "object" &&
        value !== null &&
        "type" in value &&
        value.type === "image_url" &&
        "image_url" in value &&
        typeof value.image_url === "object" &&
        value.image_url !== null &&
        "url" in value.image_url &&
        typeof value.image_url.url === "string"
    );
}

export async function readLargeChatBody(
    stream: ReadableStream<Uint8Array>,
    uploadImage: (dataUrl: string) => Promise<string>,
): Promise<{ body: string; digest: string }> {
    const parser = new JSONParser({
        paths: ["$.messages.*.content.*", "$"],
    });
    const hash = createHash("sha256");
    const pending: Array<{ part: ImagePart; dataUrl: string }> = [];
    let parsed: unknown;
    let totalBytes = 0;
    let parsedBytes = 0;
    let offloadedBytes = 0;

    parser.onValue = ({ value, stack }) => {
        if (stack.length === 0) {
            parsed = value;
            return;
        }
        if (!imagePart(value) || !value.image_url.url.startsWith("data:image/"))
            return;
        const dataUrl = value.image_url.url;
        if (dataUrl.length > MAX_IMAGE_DATA_URL) {
            throw new HTTPException(413, {
                message: "An inline image exceeds the 20 MiB limit",
            });
        }
        value.image_url.url = "";
        pending.push({ part: value, dataUrl });
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
            hash.update(value);
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
                for (const { part, dataUrl } of pending.splice(0)) {
                    part.image_url.url = await uploadImage(dataUrl);
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
    const body = JSON.stringify(parsed);
    if (body.length > MAX_REWRITTEN_BODY) {
        throw new HTTPException(413, {
            message:
                offloadedBytes > 0
                    ? "Chat content exceeds the 31 MiB limit after image offload"
                    : "Request body exceeds the 32 MiB limit",
        });
    }
    return { body, digest: hash.digest("hex") };
}

/** Large inline images become URLs before Hono or the provider constructs another JSON copy. */
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

    const { body, digest } = await readLargeChatBody(
        stream,
        async (dataUrl) => {
            const user = c.var.auth.requireUser();
            const match =
                /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
                    dataUrl,
                );
            if (!match) {
                throw new HTTPException(400, {
                    message: "Invalid inline image data URL",
                });
            }
            const bytes = Buffer.from(match[2], "base64");
            const upload = await c.env.MEDIA.upload(
                new Blob([bytes]).stream(),
                {
                    contentType: match[1],
                    size: bytes.byteLength,
                    uploadedBy: user.id,
                    keyType: "chat-input",
                },
            );
            return upload.url;
        },
    );

    const headers = new Headers(c.req.raw.headers);
    headers.set(
        "content-length",
        String(new TextEncoder().encode(body).byteLength),
    );
    c.req.raw = new Request(c.req.raw, { body, headers });
    c.req.bodyCache = {};
    c.set("generationRequestBody", body);
    c.set("generationCacheBody", digest);
    await next();
});
