import { UpstreamError } from "@shared/error.ts";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import { base64ToBuffer, toDataUri } from "../utils/imageDownload.ts";
import {
    geminiImageConfig,
    mapVertexGeminiImageUsage,
    type VertexGeminiImageUsage,
} from "./vertexAIGeminiImageModel.ts";

const ENDPOINT = "https://ai-gateway.vercel.sh/v1/chat/completions";

type VercelImageResponse = {
    choices?: Array<{
        finish_reason?: string;
        message?: {
            images?: Array<{ image_url?: { url?: string } }>;
            provider_metadata?: {
                google?: { usageMetadata?: VertexGeminiImageUsage };
            };
        };
    }>;
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        cost?: number;
    };
};

export async function callVercelGeminiImageAPI(
    prompt: string,
    params: ImageParams,
): Promise<ImageGenerationResult> {
    const imageConfig = geminiImageConfig(params, "tiered-2K");
    const apiKey = getImageEnv("AI_GATEWAY_API_KEY");
    if (!apiKey)
        throw new Error("AI_GATEWAY_API_KEY environment variable is required");
    const content: Array<unknown> = [{ type: "text", text: prompt }];
    for (const image of params.image) {
        content.push({
            type: "image_url",
            image_url: { url: await toDataUri(image) },
        });
    }
    const response = await fetchUpstream(ENDPOINT, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "google/gemini-nano-banana-2.1",
            messages: [{ role: "user", content }],
            modalities: ["text", "image"],
            providerOptions: {
                gateway: { only: ["google"] },
                google: { imageConfig },
            },
        }),
    });
    try {
        const data = (await response.json()) as VercelImageResponse;
        const choice = data.choices?.[0];
        const image = choice?.message?.images?.[0]?.image_url?.url;
        if (!image?.startsWith("data:image/")) {
            throw UpstreamError.fromProvider(
                choice?.finish_reason === "content_filter" ? 400 : 502,
                {
                    message: "Vercel Google returned no image",
                    ...(choice?.finish_reason === "content_filter" && {
                        errorCode: "content_policy_violation",
                    }),
                },
            );
        }
        const google =
            choice?.message?.provider_metadata?.google?.usageMetadata;
        const reported = data.usage;
        if (
            !google ||
            typeof reported?.cost !== "number" ||
            !Number.isFinite(reported.cost) ||
            reported.cost < 0 ||
            reported.prompt_tokens !== google.promptTokenCount ||
            reported.total_tokens !== google.totalTokenCount ||
            reported.completion_tokens !==
                (google.candidatesTokenCount ?? NaN) +
                    (google.thoughtsTokenCount ?? 0)
        ) {
            throw new Error(
                "Vercel returned invalid image billing usage metadata",
            );
        }
        // The gateway's standard image_tokens is zero. Google's details carry
        // image usage, but can omit text; candidatesTokenCount includes it.
        const details = [...(google.candidatesTokensDetails ?? [])];
        if (!details.some((detail) => detail.modality === "TEXT")) {
            details.push({
                modality: "TEXT",
                tokenCount:
                    (google.candidatesTokenCount ?? NaN) -
                    details.reduce(
                        (sum, detail) => sum + (detail.tokenCount ?? NaN),
                        0,
                    ),
            });
        }
        const usage = mapVertexGeminiImageUsage(
            { ...google, candidatesTokensDetails: details },
            true,
        );
        return {
            buffer: base64ToBuffer(image),
            trackingData: {
                actualModel: params.model,
                usage,
                pricingInput: {
                    providerBilling: { units: reported.cost, unitCost: 1 },
                },
            },
        };
    } catch (error) {
        throw UpstreamError.fromProvider(
            error instanceof UpstreamError
                ? (error.upstreamStatus ?? error.status)
                : 502,
            {
                message:
                    error instanceof Error
                        ? error.message.replace("Vertex AI", "Vercel Google")
                        : "Invalid Vercel image response",
                requestUrl: new URL(ENDPOINT),
                errorCode:
                    error instanceof UpstreamError
                        ? error.errorCode
                        : undefined,
                cause: error,
            },
        );
    }
}
