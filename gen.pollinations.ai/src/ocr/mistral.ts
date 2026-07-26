import {
    ensureUpstreamOk,
    getDefaultErrorMessage,
    UpstreamError,
} from "@shared/error.ts";
import { buildUsageHeaders } from "@shared/registry/usage-headers.ts";
import type { Context } from "hono";
import type { Env } from "@/env.ts";
import {
    type CreateOcrRequest,
    CreateOcrResponseSchema,
} from "@/schemas/ocr.ts";

const MISTRAL_OCR_URL = "https://api.mistral.ai/v1/ocr";
const MISTRAL_OCR_MODEL_ID = "mistral-ocr-4-0";
const MISTRAL_OCR_TIMEOUT_MS = 120_000;
const MAX_MISTRAL_OCR_RESPONSE_BYTES = 8 * 1024 * 1024;

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

export async function handleMistralOcr(
    c: Context<Env>,
    request: CreateOcrRequest,
): Promise<Response> {
    const apiKey = c.env.MISTRAL_API_KEY;
    if (!apiKey) {
        throw new UpstreamError(500, {
            message: "Mistral OCR service is not configured (missing API key)",
        });
    }

    const { model: _model, ...parameters } = request;
    let response: Response;
    try {
        response = await fetch(MISTRAL_OCR_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                ...parameters,
                model: MISTRAL_OCR_MODEL_ID,
            }),
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

    const parsed = CreateOcrResponseSchema.safeParse(parsedJson);
    if (!parsed.success) {
        throw new UpstreamError(502, {
            message: "Mistral OCR returned an invalid response",
            requestUrl: new URL(MISTRAL_OCR_URL),
            upstreamStatus: upstream.status,
            responseBody: responseText,
            cause: parsed.error,
        });
    }

    return Response.json(parsed.data, {
        headers: buildUsageHeaders(MISTRAL_OCR_MODEL_ID, {}),
    });
}
