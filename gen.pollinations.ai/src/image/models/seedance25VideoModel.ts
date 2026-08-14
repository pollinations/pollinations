import debug from "debug";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import { closestRatioLogSpace } from "../utils/aspectRatio.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import { toDataUri } from "../utils/imageDownload.ts";
import {
    ReplicateError,
    runReplicatePrediction,
    toReplicateHttpError,
} from "../utils/replicateClient.ts";

const logOps = debug("pollinations:seedance-2.5:ops");
const logError = debug("pollinations:seedance-2.5:error");
const MODEL = "bytedance/seedance-2.5";
const DURATION = 4;
const ASPECT_RATIOS = ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"] as const;
type Seedance25AspectRatio = (typeof ASPECT_RATIOS)[number];

interface Seedance25Input {
    prompt: string;
    duration: 4;
    resolution: "480p" | "720p";
    aspect_ratio: Seedance25AspectRatio;
    generate_audio: boolean;
    seed?: number;
    image?: string;
    last_frame_image?: string;
}

function resolveAspectRatio(safeParams: ImageParams): Seedance25AspectRatio {
    if (safeParams.aspectRatio) {
        if (
            (ASPECT_RATIOS as readonly string[]).includes(
                safeParams.aspectRatio,
            )
        ) {
            return safeParams.aspectRatio as Seedance25AspectRatio;
        }
        throw new HttpError(
            `aspectRatio "${safeParams.aspectRatio}" is not supported by Seedance 2.5. Supported: ${ASPECT_RATIOS.join(", ")}.`,
            400,
        );
    }
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
    if ((safeParams.duration ?? DURATION) !== DURATION) {
        throw new HttpError(
            "Seedance 2.5 currently supports 4-second videos",
            400,
        );
    }

    const resolution = safeParams.resolution ?? "480p";
    if (resolution !== "480p" && resolution !== "720p") {
        throw new HttpError(
            "Seedance 2.5 supports 480p or 720p resolution",
            400,
        );
    }

    const images = safeParams.image ?? [];
    if (images.length > 2) {
        throw new HttpError(
            "Seedance 2.5 supports at most two images: image[0] as first frame and image[1] as last frame.",
            400,
        );
    }

    const input: Seedance25Input = {
        prompt,
        duration: DURATION,
        resolution,
        aspect_ratio: resolveAspectRatio(safeParams),
        generate_audio: safeParams.audio,
    };
    if (safeParams.seed !== undefined && safeParams.seed !== -1) {
        input.seed = safeParams.seed;
    }
    if (images[0]) input.image = await toDataUri(images[0]);
    if (images[1]) input.last_frame_image = await toDataUri(images[1]);

    let videoUrl: string;
    let actualDurationSeconds: number | undefined;
    try {
        const result = await runReplicatePrediction<Seedance25Input, string>({
            model: MODEL,
            input,
        });
        videoUrl = result.output;
        actualDurationSeconds = result.videoOutputDurationSeconds;
        logOps("prediction succeeded", {
            id: result.id,
            predictTimeSeconds: result.predictTimeSeconds,
            videoOutputDurationSeconds: actualDurationSeconds,
        });
    } catch (error) {
        logError("prediction failed", error);
        if (error instanceof ReplicateError) {
            logError("Replicate error", {
                message: error.message,
                status: error.status,
            });
        }
        throw toReplicateHttpError(error, "Seedance 2.5 generation failed");
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
            actualModel: "seedance-2.5",
            usage: { completionVideoSeconds: billedDuration },
        },
    };
}
