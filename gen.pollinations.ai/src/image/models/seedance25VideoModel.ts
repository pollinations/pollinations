import { UpstreamError } from "@shared/error.ts";
import debug from "debug";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import type { ImageParams } from "../params.ts";
import { closestRatioLogSpace } from "../utils/aspectRatio.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import { toDataUri } from "../utils/imageDownload.ts";
import {
    runReplicatePrediction,
    toReplicateUpstreamError,
} from "../utils/replicateClient.ts";

const logOps = debug("pollinations:seedance-2.5:ops");
const logError = debug("pollinations:seedance-2.5:error");
const MODEL = "bytedance/seedance-2.5";
const DURATION = 4;
// Edits and extensions can take longer than the default 6 minutes. Stay
// under the 15-minute Durable Object alarm limit so the result gets cached.
const PREDICTION_DEADLINE_MINUTES = 14;
const ASPECT_RATIOS = ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"] as const;

interface Seedance25Input {
    prompt: string;
    duration: 4 | -1;
    resolution: "480p" | "720p";
    aspect_ratio: string;
    generate_audio: boolean;
    seed?: number;
    image?: string;
    last_frame_image?: string;
    reference_images?: string[];
    reference_videos?: string[];
    reference_audios?: string[];
}

function resolveAspectRatio(safeParams: ImageParams): string {
    if (safeParams.aspectRatio) return safeParams.aspectRatio;
    // Unless the caller chose a ratio, a reference video means an edit.
    if (safeParams.reference_videos?.length) return "adaptive";
    if (!safeParams.dimensionsExplicit) return "16:9";
    return closestRatioLogSpace(
        safeParams.width,
        safeParams.height,
        ASPECT_RATIOS,
    );
}

export async function callSeedance25API(
    prompt: string,
    safeParams: ImageParams,
): Promise<VideoGenerationResult> {
    // params.ts limits resolution to the registry's list (480p, 720p).
    const resolution = (safeParams.resolution ??
        "480p") as Seedance25Input["resolution"];

    const images = safeParams.image ?? [];
    const aspectRatio = resolveAspectRatio(safeParams);
    // Replicate's video edit mode needs "adaptive" and duration -1. Edit,
    // extension and motion transfer all look alike here, so with a reference
    // video "adaptive" lets the model pick the length for all three.
    const autoDuration =
        aspectRatio === "adaptive" && !!safeParams.reference_videos?.length;

    const input: Seedance25Input = {
        prompt,
        duration: autoDuration ? -1 : DURATION,
        resolution,
        aspect_ratio: aspectRatio,
        generate_audio: safeParams.audio ?? true,
    };
    if (safeParams.seed !== undefined && safeParams.seed !== -1) {
        input.seed = safeParams.seed;
    }
    if (images[0]) input.image = await toDataUri(images[0]);
    if (images[1]) input.last_frame_image = await toDataUri(images[1]);
    if (safeParams.reference_images?.length) {
        input.reference_images = safeParams.reference_images;
    }
    if (safeParams.reference_videos?.length) {
        input.reference_videos = safeParams.reference_videos;
    }
    if (safeParams.reference_audios?.length) {
        input.reference_audios = safeParams.reference_audios;
    }

    let videoUrl: string;
    let actualDurationSeconds: number | undefined;
    try {
        const result = await runReplicatePrediction<Seedance25Input, string>({
            model: MODEL,
            input,
            predictionDeadlineMinutes: PREDICTION_DEADLINE_MINUTES,
        });
        videoUrl = result.output;
        actualDurationSeconds = result.videoOutputDurationSeconds;
        if (autoDuration && actualDurationSeconds === undefined) {
            // The model picked the length, so there is no requested
            // duration to bill instead.
            throw UpstreamError.fromProvider(502, {
                message:
                    "Replicate Seedance 2.5 response is missing output video duration",
            });
        }
        logOps("prediction succeeded", {
            id: result.id,
            predictTimeSeconds: result.predictTimeSeconds,
            videoOutputDurationSeconds: actualDurationSeconds,
        });
    } catch (error) {
        logError("prediction failed", error);
        throw toReplicateUpstreamError(error, "Seedance 2.5 generation failed");
    }

    const videoResponse = await fetchUpstream(videoUrl, {
        errorLabel: "Failed to download Seedance 2.5 output video",
    });
    const buffer = Buffer.from(await videoResponse.arrayBuffer());
    const billedDuration = actualDurationSeconds ?? DURATION;

    return {
        buffer,
        mimeType: "video/mp4",
        durationSeconds: billedDuration,
        trackingData: {
            actualModel: "bytedance/seedance-2.5",
            usage: { completionVideoSeconds: billedDuration },
        },
    };
}
