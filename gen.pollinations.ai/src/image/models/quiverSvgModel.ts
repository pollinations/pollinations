import { UpstreamError } from "@shared/error.ts";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import { downloadImageAsBase64 } from "../utils/imageDownload.ts";

const SVG = "image/svg+xml";

export async function callArrowSVGAPI(
    prompt: string,
    params: ImageParams,
): Promise<ImageGenerationResult> {
    const key = getImageEnv("QUIVER_API_KEY");
    if (!key)
        throw UpstreamError.fromProvider(500, {
            message: "QuiverAI is not configured",
        });
    const references = await Promise.all(
        params.image.map(async (source) => {
            const { base64 } = await downloadImageAsBase64(source);
            return { base64 };
        }),
    );
    const response = await fetchUpstream(
        "https://api.quiver.ai/v1/svgs/generations",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "arrow-2",
                prompt,
                n: 1,
                stream: false,
                ...(references.length && { references }),
            }),
            errorLabel: "QuiverAI SVG generation failed",
        },
    );
    const { data, usage } = (await response.json()) as {
        data?: { svg?: string; mime_type?: string }[];
        usage?: { input_tokens: number; output_tokens: number };
    };
    const image = data?.[0];
    if (!image?.svg || image.mime_type !== SVG) {
        throw UpstreamError.fromProvider(502, {
            message: "QuiverAI returned no SVG",
        });
    }
    if (
        !usage ||
        !Number.isSafeInteger(usage.input_tokens) ||
        usage.input_tokens <= 0 ||
        !Number.isSafeInteger(usage.output_tokens) ||
        usage.output_tokens <= 0
    ) {
        throw UpstreamError.fromProvider(502, {
            message: "QuiverAI returned invalid billing usage",
        });
    }
    return {
        buffer: Buffer.from(image.svg),
        mimeType: SVG,
        trackingData: {
            actualModel: params.model,
            usage: {
                promptTextTokens: usage.input_tokens,
                completionTextTokens: usage.output_tokens,
            },
        },
    };
}
