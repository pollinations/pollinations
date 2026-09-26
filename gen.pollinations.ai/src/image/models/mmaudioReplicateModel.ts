import { Buffer } from "node:buffer";
import { UpstreamError } from "@shared/error.ts";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { readResponseBytes } from "@shared/response-bytes.ts";
import { validateUserMediaUrl } from "@shared/user-media-url.ts";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import type { ImageParams } from "../params.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import { mp4TrackDurations } from "../utils/mp4.ts";
import {
    runReplicatePrediction,
    toReplicateUpstreamError,
} from "../utils/replicateClient.ts";

export const MMAUDIO_VERSION =
    "62871fb59889b2d7c13777f08deb3b36bdff88f7e1d53a50ad7694548a41b484";

const MODEL = "sony/mmaudio-v2";
const { minDuration, maxDuration, defaultDuration } = IMAGE_SERVICES[MODEL];

/**
 * MMAudio adds a generated soundtrack to the single `reference_videos` source
 * and returns that video. Customers pay Replicate's reported GPU time.
 */
export async function callMMAudioAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<VideoGenerationResult> {
    const sources = safeParams.reference_videos ?? [];
    if (sources.length !== 1) {
        throw new UpstreamError(400, {
            message: `${MODEL} requires exactly one reference_videos URL: the video to add sound to.`,
        });
    }
    const duration = safeParams.duration ?? defaultDuration;
    if (duration < minDuration || duration > maxDuration) {
        throw new UpstreamError(400, {
            message: `${MODEL} supports a duration of ${minDuration}-${maxDuration} seconds.`,
        });
    }

    let url: string;
    let computeSeconds: number;
    try {
        const result = await runReplicatePrediction<
            Record<string, unknown>,
            string
        >({
            model: "zsxkib/mmaudio",
            version: MMAUDIO_VERSION,
            input: {
                video: sources[0],
                prompt,
                duration,
                seed: safeParams.seed,
                num_steps: 25,
                cfg_strength: 4.5,
            },
        });
        url = result.output;
        computeSeconds = result.predictTimeSeconds;
    } catch (error) {
        throw toReplicateUpstreamError(error, "MMAudio generation failed");
    }
    if (!Number.isFinite(computeSeconds) || computeSeconds <= 0) {
        throw UpstreamError.fromProvider(502, {
            message: "Replicate response has no compute usage",
        });
    }
    if (typeof url !== "string" || !validateUserMediaUrl(url).ok) {
        throw UpstreamError.fromProvider(502, {
            message: "MMAudio response has no valid output URL",
        });
    }

    const bytes = await readResponseBytes(
        await fetchUpstream(url),
        64 * 1024 * 1024,
        () =>
            UpstreamError.fromProvider(502, {
                message: "MMAudio output exceeds the 64 MB response limit",
            }),
    );
    let durations: ReturnType<typeof mp4TrackDurations>;
    try {
        durations = mp4TrackDurations(bytes);
    } catch (cause) {
        throw UpstreamError.fromProvider(502, {
            message: "MMAudio returned an invalid video or missing soundtrack",
            cause,
        });
    }

    return {
        buffer: Buffer.from(bytes),
        mimeType: "video/mp4",
        durationSeconds: durations.video,
        trackingData: {
            actualModel: MODEL,
            usage: { completionVideoSeconds: durations.video },
            pricingInput: { computeSeconds },
        },
    };
}
