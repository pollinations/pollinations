import { UpstreamError } from "@shared/error.ts";
import { createGateway, experimental_generateVideo } from "ai";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import type { VideoGenerationResult } from "./veoVideoModel.ts";

// Vercel AI Gateway serves this model through Google and Vertex AI.
const VERCEL_MODEL_ID = "google/gemini-omni-1.2-flash";

// AI SDK resolution is WIDTHxHEIGHT for landscape; portrait swaps the sides.
const LANDSCAPE_SIZES = {
    "360p": "640x360",
    "720p": "1280x720",
    "1080p": "1920x1080",
    "4k": "3840x2160",
} as const;

export async function callGeminiOmniVercelAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<VideoGenerationResult> {
    const duration = safeParams.duration ?? 5;
    const resolution = (safeParams.resolution ??
        "720p") as keyof typeof LANDSCAPE_SIZES;
    const aspectRatio =
        safeParams.aspectRatio === "16:9" || safeParams.aspectRatio === "9:16"
            ? safeParams.aspectRatio
            : safeParams.dimensionsExplicit &&
                safeParams.height > safeParams.width
              ? "9:16"
              : "16:9";
    const size =
        aspectRatio === "9:16"
            ? LANDSCAPE_SIZES[resolution].split("x").reverse().join("x")
            : LANDSCAPE_SIZES[resolution];

    const gateway = createGateway({
        apiKey: getImageEnv("AI_GATEWAY_API_KEY"),
    });
    const { videos, providerMetadata } = await experimental_generateVideo({
        model: gateway.video(VERCEL_MODEL_ID),
        prompt,
        duration,
        aspectRatio,
        resolution: size as `${number}x${number}`,
        ...(safeParams.image.length > 0
            ? {
                  frameImages: safeParams.image.map((image, index) => ({
                      image,
                      frameType: index === 0 ? "first_frame" : "last_frame",
                  })),
              }
            : {}),
        // Keep each start and status request short; the job runs in the gateway.
        poll: { intervalMs: 5000, timeoutMs: 10 * 60 * 1000 },
    }).catch((error: { statusCode?: number; message: string }) => {
        throw UpstreamError.fromProvider(error.statusCode ?? 502, {
            message: `Gemini Omni Vercel generation failed: ${error.message}`,
        });
    });

    // Bill the gateway's reported cost, as the Seedream Vercel route does.
    const reportedCost = (
        providerMetadata?.gateway as { cost?: unknown } | undefined
    )?.cost;
    const cost =
        typeof reportedCost === "string" && reportedCost.trim()
            ? Number(reportedCost)
            : reportedCost;
    const video = videos[0];
    if (
        typeof cost !== "number" ||
        !Number.isFinite(cost) ||
        cost < 0 ||
        !video
    ) {
        throw UpstreamError.fromProvider(502, {
            message:
                "Gemini Omni Vercel response is missing video or valid billed cost",
        });
    }

    return {
        buffer: Buffer.from(video.uint8Array),
        mimeType: "video/mp4",
        durationSeconds: duration,
        trackingData: {
            actualModel: safeParams.model,
            usage: { completionVideoSeconds: duration },
            providerBilling: { units: cost, unitCost: 1 },
        },
    };
}
