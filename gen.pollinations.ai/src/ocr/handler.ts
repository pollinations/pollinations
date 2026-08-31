import { UpstreamError } from "@shared/error.ts";
import { getOcrProviderModelId } from "@shared/registry/ocr.ts";
import type { ModelDefinition, Usage } from "@shared/registry/registry.ts";
import { buildUsageHeaders } from "@shared/registry/usage-headers.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { CreateOcrRequest, CreateOcrResponse } from "../schemas/ocr.ts";

// Per-provider upstream config. The host/key are read from env so plugging in
// a new OCR backend is a one-line binding change — the request/response
// handling and billing below stay provider-agnostic (Mistral-shaped).
type OcrProviderConfig = {
    host: (env: CloudflareBindings) => string | undefined;
    key: (env: CloudflareBindings) => string | undefined;
};

const OCR_PROVIDERS: Record<string, OcrProviderConfig> = {
    mistral: {
        host: () => "https://api.mistral.ai",
        key: (env) => env.MISTRAL_API_KEY,
    },
    paddle: {
        host: (env) => env.PADDLE_OCR_HOST,
        key: (env) => env.PADDLE_OCR_API_KEY,
    },
    baidu: {
        host: (env) => env.BAIDU_OCR_HOST,
        key: (env) => env.BAIDU_OCR_API_KEY,
    },
};

export async function generateOcr(
    env: CloudflareBindings,
    request: CreateOcrRequest,
    serviceDef: ModelDefinition,
    responseModel: string = request.model ?? "",
): Promise<Response> {
    const config = OCR_PROVIDERS[serviceDef.provider];
    if (!config) {
        throw new Error(`Unsupported OCR provider: ${serviceDef.provider}`);
    }

    const host = config.host(env);
    const apiKey = config.key(env);
    if (!host) {
        throw new Error(
            `OCR provider "${serviceDef.provider}" upstream host is not configured`,
        );
    }
    if (!apiKey) {
        throw new Error(
            `OCR provider "${serviceDef.provider}" API key is not configured`,
        );
    }

    const upstreamBody = {
        model: getOcrProviderModelId(responseModel),
        document: request.document,
        include_image_base64: request.include_image_base64 ?? false,
        ...(request.pages ? { pages: request.pages } : {}),
    };

    const upstreamRes = await fetch(`${host}/v1/ocr`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(upstreamBody),
    });

    if (!upstreamRes.ok) {
        const text = await upstreamRes.text();
        throw new UpstreamError(upstreamRes.status as ContentfulStatusCode, {
            message: `OCR upstream for "${responseModel}" failed: ${text}`,
            requestUrl: new URL(`${host}/v1/ocr`),
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

// OCR billing: image-input-heavy, text-output-light. Each processed page is
// one input image token; the returned markdown is approximated as 1 token per
// 4 characters of output. Providers that report token usage directly can
// override this by populating usage_info.
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
