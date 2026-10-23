import { UpstreamError } from "@shared/error.ts";
import type { Usage } from "@shared/registry/registry.ts";
import { buildUsageHeaders } from "@shared/registry/usage-headers.ts";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Env } from "@/env.ts";
import { withModelFallbackResponse } from "../fallback.ts";
import type { CreateOcrRequest, CreateOcrResponse } from "../schemas/ocr.ts";

// Mistral's wire contract for the one shipped OCR listing. The host/key come
// from env so the binding — not the code — changes if the key rotates.
const MISTRAL_OCR_URL = "https://api.mistral.ai/v1/ocr";
// Pinned so a new Mistral release cannot change output or price unreviewed.
const MISTRAL_OCR_MODEL = "mistral-ocr-4-1";

export async function generateOcr(
    env: CloudflareBindings,
    request: CreateOcrRequest,
    responseModel: string,
): Promise<Response> {
    if (!env.MISTRAL_API_KEY) {
        throw new UpstreamError(500 as ContentfulStatusCode, {
            message: "Mistral OCR is not configured (missing MISTRAL_API_KEY)",
        });
    }

    const upstreamRes = await fetch(MISTRAL_OCR_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${env.MISTRAL_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: MISTRAL_OCR_MODEL,
            document: request.document,
            include_image_base64: request.include_image_base64 ?? false,
            ...(request.pages ? { pages: request.pages } : {}),
        }),
    });

    if (!upstreamRes.ok) {
        const text = await upstreamRes.text();
        throw UpstreamError.fromProvider(upstreamRes.status, {
            message: `OCR upstream for "${responseModel}" failed: ${text}`,
            requestUrl: new URL(MISTRAL_OCR_URL),
            responseBody: text,
        });
    }

    const data = (await upstreamRes.json()) as CreateOcrResponse;
    const pagesProcessed = data.usage_info?.pages_processed;
    if (!Number.isInteger(pagesProcessed)) {
        throw new UpstreamError(502, {
            message: `OCR upstream for "${responseModel}" returned no usage_info.pages_processed`,
            requestUrl: new URL(MISTRAL_OCR_URL),
        });
    }
    // Mistral answers 200 with nothing processed when no requested index
    // exists in the document.
    if (pagesProcessed === 0 && request.pages?.length) {
        throw new UpstreamError(400, {
            message:
                "None of the requested pages exist in this document. `pages` takes 0-based page indices.",
            requestUrl: new URL(MISTRAL_OCR_URL),
        });
    }
    // One processed page is one input image token, rated in the registry at
    // Mistral's per-page price.
    const usage: Usage = { promptImageTokens: pagesProcessed };

    return new Response(JSON.stringify(data), {
        headers: {
            "Content-Type": "application/json",
            ...buildUsageHeaders(responseModel, usage),
        },
    });
}

/** Route handler shared by the gateway chain and the durable executor. */
export async function generateOcrResponse(c: Context<Env>): Promise<Response> {
    const requestBody = c.req.valid("json" as never) as CreateOcrRequest;
    return withModelFallbackResponse(
        c.var.model,
        (candidate) =>
            generateOcr(
                c.env,
                { ...requestBody, model: candidate.id },
                candidate.id,
            ),
        c.var.track?.attempts,
    );
}
