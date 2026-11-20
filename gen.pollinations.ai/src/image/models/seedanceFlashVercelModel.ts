import { UpstreamError } from "@shared/error.ts";
import { createGateway, experimental_generateVideo as generateVideo } from "ai";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { sleep } from "../util.ts";
import { seedanceFlashAspectRatio } from "./openRouterVideoModel.ts";

// Both Gateway operations use POST. Only the status operation can safely be
// repeated after a timeout: its body identifies the already-paid job.
const fetchGateway: typeof fetch = async (input, init) => {
    if (
        String(input) !==
            "https://ai-gateway.vercel.sh/v4/ai/video-model/status" ||
        typeof init?.body !== "string"
    )
        return fetch(input, init);

    for (let attempt = 0; ; attempt++) {
        try {
            const response = await fetch(input, init);
            const transient =
                response.status === 408 ||
                response.status === 429 ||
                response.status >= 500;
            if (!transient || attempt >= 2) return response;
            await response.body?.cancel();
        } catch (error) {
            if (init.signal?.aborted || attempt >= 2) throw error;
        }
        await sleep(3000);
    }
};

export async function callVercelSeedance25FlashAPI(
    prompt: string,
    params: ImageParams,
): Promise<VideoGenerationResult> {
    const apiKey = getImageEnv("AI_GATEWAY_API_KEY");
    if (!apiKey)
        throw UpstreamError.fromProvider(500, {
            message: "Vercel AI Gateway is not configured",
        });
    const gateway = createGateway({ apiKey, fetch: fetchGateway });
    const duration = params.duration ?? 5;
    const references = [
        ...(params.reference_images ?? []).map((data) => ({
            data,
            mediaType: "image/*",
        })),
        ...(params.reference_videos ?? []).map((data) => ({
            data,
            mediaType: "video/*",
        })),
    ];
    const result = await generateVideo({
        model: gateway.video("bytedance/seedance-2.5-flash"),
        prompt,
        duration,
        resolution: params.resolution === "720p" ? "1280x720" : "864x480",
        // ByteDance derives the output shape from the first keyframe.
        aspectRatio: params.image.length
            ? undefined
            : seedanceFlashAspectRatio(params),
        generateAudio: params.audio ?? true,
        seed: params.seed === -1 ? undefined : params.seed,
        frameImages: params.image.length
            ? params.image.map((url, index) => ({
                  image: url,
                  frameType: index === 0 ? "first_frame" : "last_frame",
              }))
            : undefined,
        inputReferences: references.length ? references : undefined,
        providerOptions: {
            gateway: { only: ["bytedance"] },
            // The native adapter treats non-video inputReferences as images.
            bytedance: { referenceAudio: params.reference_audios ?? [] },
        },
        maxRetries: 0,
        poll: { intervalMs: 3000 },
    }).catch((error: { statusCode?: number; message: string }) => {
        throw UpstreamError.fromProvider(error.statusCode ?? 502, {
            message: `Vercel Seedance generation failed: ${error.message}`,
        });
    });
    const usage = result.providerMetadata.bytedance?.usage;
    const tokens =
        usage && typeof usage === "object" && !Array.isArray(usage)
            ? usage.completion_tokens
            : undefined;
    if (
        typeof tokens !== "number" ||
        !Number.isSafeInteger(tokens) ||
        tokens <= 0
    ) {
        throw UpstreamError.fromProvider(502, {
            message:
                "Vercel Seedance returned no valid billable video token count",
        });
    }
    return {
        buffer: Buffer.from(result.video.uint8Array),
        mimeType: result.video.mediaType,
        durationSeconds: duration,
        trackingData: {
            actualModel: params.model,
            // ByteDance meters the entire request, including reference video, in these tokens.
            usage: {
                completionVideoSeconds: duration,
                completionVideoTokens: tokens,
            },
        },
    };
}
