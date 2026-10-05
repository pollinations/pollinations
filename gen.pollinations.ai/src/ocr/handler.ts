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
const MISTRAL_OCR_MODEL = "mistral-ocr-latest";

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
    const usage = ocrUsageFromResponse(data);

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

// OCR billing: one input image token per processed page, rated in the registry
// at Mistral's per-page price. `usage_info.pages_processed` is what the
// provider reports, so it — not the response body — drives the charge; the
// returned markdown is reported as completion tokens for telemetry only.
function ocrUsageFromResponse(data: CreateOcrResponse): Usage {
    const pagesProcessed =
        data.usage_info?.pages_processed ?? data.pages.length;
    const markdownChars = data.pages.reduce(
        (sum, page) => sum + (page.markdown?.length ?? 0),
        0,
    );
    return {
        promptImageTokens: pagesProcessed,
        completionTextTokens: Math.ceil(markdownChars / 4),
    };
}
