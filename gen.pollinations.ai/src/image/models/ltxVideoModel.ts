import { UpstreamError } from "@shared/error.ts";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { runFalJobResponse } from "../../model3d/models/falClient.ts";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { closestRatioLogSpace } from "../utils/aspectRatio.ts";
import { falBillableUnits, falUnitPrice } from "../utils/falBillableUnits.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import {
    runReplicatePrediction,
    toReplicateUpstreamError,
} from "../utils/replicateClient.ts";

const PRIMARY = "lightricks/ltx-2.5-fast";
const FAL = "lightricks/ltx-2.5-fast:fal";

export async function callLtxVideo(
    prompt: string,
    params: ImageParams,
): Promise<VideoGenerationResult> {
    const [start, end] = params.image;
    const duration = params.duration ?? 6;
    const resolution = params.resolution ?? "720p";
    const fps = params.fps ?? 25;
    const aspectRatio =
        params.aspectRatio ??
        closestRatioLogSpace(params.width, params.height, ["16:9", "9:16"]);
    if (!["16:9", "9:16"].includes(aspectRatio)) {
        throw new UpstreamError(400, {
            message: "LTX 2.5 Fast supports 16:9 and 9:16.",
        });
    }
    if (
        ![24, 25, 48, 50].includes(fps) ||
        (duration > 10 && (fps > 25 || !["720p", "1080p"].includes(resolution)))
    ) {
        throw new UpstreamError(400, {
            message:
                "LTX 2.5 Fast supports 24, 25, 48, or 50 FPS. Durations over 10 seconds require 720p or 1080p at 24 or 25 FPS.",
        });
    }
    const input = {
        prompt,
        duration,
        fps,
        aspect_ratio: aspectRatio,
        generate_audio: params.audio ?? true,
    };
    let videoUrl: string | undefined;
    let seconds: number | undefined;
    let providerBilling: { units: number; unitCost: number } | undefined;
    if (params.model === FAL) {
        const apiKey = getImageEnv("FAL_KEY");
        if (!apiKey)
            throw UpstreamError.fromProvider(500, {
                message: "FAL_KEY is not configured",
            });
        const endpoint = `lightricks/ltx-2.5/${start ? "image-to-video" : "text-to-video"}/fast`;
        const unitCost = await falUnitPrice(endpoint, apiKey);
        const response = await runFalJobResponse(
            {
                endpoint,
                input: {
                    ...input,
                    resolution: resolution === "2k" ? "1440p" : resolution,
                    image_url: start,
                    end_image_url: end,
                },
            },
            apiKey,
        );
        const units = falBillableUnits(response);
        const result = (await response.json()) as { video?: { url?: string } };
        const definition = IMAGE_SERVICES[FAL];
        const rate =
            definition.costVariants?.[resolution]?.completionVideoSeconds ??
            definition.cost.completionVideoSeconds;
        if (!rate) throw new Error("Missing LTX Fast Fal rate");
        seconds = (units * unitCost) / rate;
        providerBilling = { units, unitCost };
        videoUrl = result.video?.url;
    } else {
        try {
            const prediction = await runReplicatePrediction<
                Record<string, unknown>,
                string
            >({
                model: PRIMARY,
                input: {
                    ...input,
                    resolution,
                    image: start,
                    last_frame_image: end,
                },
            });
            videoUrl = prediction.output;
            seconds = prediction.videoOutputDurationSeconds;
        } catch (error) {
            throw toReplicateUpstreamError(error, "LTX Fast generation failed");
        }
    }
    if (!videoUrl || !seconds || !Number.isFinite(seconds) || seconds < 0) {
        throw UpstreamError.fromProvider(502, {
            message: "LTX Fast returned no video or billable duration",
        });
    }
    const video = await fetchUpstream(videoUrl, {
        errorLabel: "Failed to download LTX Fast video",
    });
    return {
        buffer: Buffer.from(await video.arrayBuffer()),
        mimeType: "video/mp4",
        durationSeconds: seconds,
        trackingData: {
            actualModel: params.model,
            usage: { completionVideoSeconds: seconds },
            providerBilling,
        },
    };
}
