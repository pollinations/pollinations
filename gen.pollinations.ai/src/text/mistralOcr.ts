import {
    ensureUpstreamOk,
    getDefaultErrorMessage,
    UpstreamError,
} from "@shared/error.ts";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Env } from "@/env.ts";
import type { ChatCompletion, RequestData } from "./types.ts";

const MISTRAL_OCR_URL = "https://api.mistral.ai/v1/ocr";
const MISTRAL_OCR_MODEL_ID = "mistral-ocr-4-0";
const MISTRAL_OCR_TIMEOUT_MS = 120_000;
const MAX_MISTRAL_OCR_RESPONSE_BYTES = 8 * 1024 * 1024;

const MistralOcrResponseSchema = z
    .object({
        pages: z
            .array(
                z
                    .object({
                        index: z.number().int().nonnegative(),
                        markdown: z.string(),
                    })
                    .passthrough(),
            )
            .min(1),
        model: z.string(),
        document_annotation: z.unknown().nullable().optional(),
        usage_info: z
            .object({
                pages_processed: z.number().int().positive(),
                doc_size_bytes: z.number().int().nonnegative().optional(),
            })
            .passthrough(),
    })
    .passthrough();

type MistralOcrDocument =
    | { type: "document_url"; document_url: string }
    | { type: "image_url"; image_url: string };

function badRequest(message: string): never {
    throw new HTTPException(400, { message });
}

function stringProperty(value: unknown, property: string): string | undefined {
    if (!value || typeof value !== "object") return undefined;
    const candidate = (value as Record<string, unknown>)[property];
    return typeof candidate === "string" && candidate.length > 0
        ? candidate
        : undefined;
}

function contentPartDocument(
    part: Record<string, unknown>,
): MistralOcrDocument | undefined {
    if (part.type === "image_url") {
        const imageUrl =
            typeof part.image_url === "string"
                ? part.image_url
                : stringProperty(part.image_url, "url");
        return imageUrl
            ? { type: "image_url", image_url: imageUrl }
            : undefined;
    }

    if (part.type === "document_url") {
        const documentUrl =
            typeof part.document_url === "string"
                ? part.document_url
                : stringProperty(part.document_url, "url");
        return documentUrl
            ? { type: "document_url", document_url: documentUrl }
            : undefined;
    }

    if (part.type !== "file" || !part.file || typeof part.file !== "object") {
        return undefined;
    }

    const file = part.file as Record<string, unknown>;
    const fileUrl =
        stringProperty(file, "file_url") ?? stringProperty(file, "file_data");
    if (!fileUrl) return undefined;

    const mimeType = stringProperty(file, "mime_type");
    const normalizedUrl =
        fileUrl.startsWith("data:") || !mimeType
            ? fileUrl
            : `data:${mimeType};base64,${fileUrl}`;
    return mimeType?.startsWith("image/")
        ? { type: "image_url", image_url: normalizedUrl }
        : { type: "document_url", document_url: normalizedUrl };
}

function extractDocument(
    messages: RequestData["messages"],
): MistralOcrDocument {
    const documents = messages.flatMap((message) => {
        if (!Array.isArray(message.content)) return [];
        return message.content.flatMap((part) => {
            if (!part || typeof part !== "object") return [];
            const document = contentPartDocument(
                part as Record<string, unknown>,
            );
            return document ? [document] : [];
        });
    });

    if (documents.length === 0) {
        return badRequest(
            "Mistral OCR requires one image_url, document_url, or file content part.",
        );
    }
    if (documents.length > 1) {
        return badRequest(
            "Mistral OCR accepts exactly one document per request.",
        );
    }
    return documents[0];
}

async function readBoundedResponseText(response: Response): Promise<string> {
    const declaredLength = Number(response.headers.get("content-length"));
    if (
        Number.isFinite(declaredLength) &&
        declaredLength > MAX_MISTRAL_OCR_RESPONSE_BYTES
    ) {
        await response.body?.cancel();
        throw new UpstreamError(502, {
            message: "Mistral OCR response exceeded the supported size limit",
            requestUrl: new URL(MISTRAL_OCR_URL),
            upstreamStatus: response.status,
        });
    }

    if (!response.body) return "";

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let responseText = "";
    let bytesRead = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytesRead += value.byteLength;
            if (bytesRead > MAX_MISTRAL_OCR_RESPONSE_BYTES) {
                await reader.cancel();
                throw new UpstreamError(502, {
                    message:
                        "Mistral OCR response exceeded the supported size limit",
                    requestUrl: new URL(MISTRAL_OCR_URL),
                    upstreamStatus: response.status,
                });
            }
            responseText += decoder.decode(value, { stream: true });
        }
        return responseText + decoder.decode();
    } finally {
        reader.releaseLock();
    }
}

export async function generateMistralOcrChatCompletion(
    c: Context<Env>,
    request: RequestData,
): Promise<ChatCompletion> {
    if (request.stream) {
        return badRequest("Mistral OCR does not support streaming.");
    }

    const apiKey = c.env.MISTRAL_API_KEY;
    if (!apiKey) {
        throw new UpstreamError(500, {
            message: "Mistral OCR service is not configured (missing API key)",
        });
    }

    const document = extractDocument(request.messages);
    const parameters = {
        document,
        pages: request.pages,
        include_image_base64: request.include_image_base64,
        image_limit: request.image_limit,
        image_min_size: request.image_min_size,
        table_format: request.table_format,
        extract_header: request.extract_header,
        extract_footer: request.extract_footer,
        include_blocks: request.include_blocks,
        confidence_scores_granularity: request.confidence_scores_granularity,
        model: MISTRAL_OCR_MODEL_ID,
    };

    let response: Response;
    try {
        response = await fetch(MISTRAL_OCR_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(parameters),
            signal: AbortSignal.timeout(MISTRAL_OCR_TIMEOUT_MS),
        });
    } catch (cause) {
        throw new UpstreamError(504, {
            message: getDefaultErrorMessage(504),
            requestUrl: new URL(MISTRAL_OCR_URL),
            cause,
        });
    }

    const upstream = await ensureUpstreamOk(response, MISTRAL_OCR_URL);
    const responseText = await readBoundedResponseText(upstream);
    let parsedJson: unknown;
    try {
        parsedJson = JSON.parse(responseText);
    } catch (cause) {
        throw new UpstreamError(502, {
            message: "Mistral OCR returned invalid JSON",
            requestUrl: new URL(MISTRAL_OCR_URL),
            upstreamStatus: upstream.status,
            responseBody: responseText,
            cause,
        });
    }

    const parsed = MistralOcrResponseSchema.safeParse(parsedJson);
    if (!parsed.success) {
        throw new UpstreamError(502, {
            message: "Mistral OCR returned an invalid response",
            requestUrl: new URL(MISTRAL_OCR_URL),
            upstreamStatus: upstream.status,
            responseBody: responseText,
            cause: parsed.error,
        });
    }

    const ocr = parsed.data;
    return {
        id: `ocr_${crypto.randomUUID().replaceAll("-", "")}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: MISTRAL_OCR_MODEL_ID,
        choices: [
            {
                index: 0,
                finish_reason: "stop",
                message: {
                    role: "assistant",
                    content: ocr.pages
                        .map((page) => page.markdown)
                        .join("\n\n"),
                    content_blocks: ocr.pages.map((page) => ({
                        type: "ocr_page",
                        ...page,
                    })),
                },
            },
        ],
        usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
        },
        ocr,
        upstreamRequestUrl: new URL(MISTRAL_OCR_URL),
    };
}
