import { Buffer } from "node:buffer";
import { UpstreamError } from "@shared/error.ts";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import { readResponseBytes } from "@shared/response-bytes.ts";
import { validateUserMediaUrl } from "@shared/user-media-url.ts";
import { FalError, runFalJobResponse } from "../../model3d/models/falClient.ts";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { falBillableUnits } from "../utils/falBillableUnits.ts";
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
 * and returns that video. Fal is primary; Replicate is a registry fallback.
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
    let computeSeconds: number | undefined;
    let billedSeconds: number | undefined;
    // Both routes retain the sound-effects contract. Fal accepts 16-bit seeds.
    const input = {
        prompt,
        duration,
        seed: safeParams.seed,
        negative_prompt: "music",
        num_steps: 25,
        cfg_strength: 4.5,
    };
    const replicate = safeParams.model === "sony/mmaudio-v2:replicate";
    try {
        if (replicate) {
            const result = await runReplicatePrediction<
                Record<string, unknown>,
                string
            >({
                model: "zsxkib/mmaudio",
                version: MMAUDIO_VERSION,
                input: { ...input, video: sources[0] },
            });
            url = result.output;
            computeSeconds = result.predictTimeSeconds;
            if (!Number.isFinite(computeSeconds) || computeSeconds <= 0) {
                throw UpstreamError.fromProvider(502, {
                    message: "Replicate response has no compute usage",
                });
            }
        } else {
            const apiKey = getImageEnv("FAL_KEY");
            if (!apiKey)
                throw UpstreamError.fromProvider(500, {
                    message: "MMAudio is not configured",
                });
            const response = await runFalJobResponse(
                {
                    endpoint: "fal-ai/mmaudio-v2",
                    input: {
                        ...input,
                        seed:
                            safeParams.seed === undefined
                                ? undefined
                                : ((safeParams.seed % 65536) + 65536) % 65536,
                        video_url: sources[0],
                    },
                },
                apiKey,
            );
            billedSeconds = falBillableUnits(response);
            const result = (await response.json()) as {
                video?: { url?: string };
            };
            url = result.video?.url ?? "";
        }
    } catch (error) {
        if (error instanceof UpstreamError) throw error;
        if (error instanceof FalError)
            throw UpstreamError.fromProvider(error.status ?? 502, {
                message: error.message,
                responseBody: error.responseBody,
            });
        throw toReplicateUpstreamError(error, "MMAudio generation failed");
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
        buffer: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
        mimeType: "video/mp4",
        durationSeconds: durations.video,
        trackingData: {
            actualModel: safeParams.model,
            // Fal bills the requested window even when the source is shorter.
            usage: { completionVideoSeconds: billedSeconds ?? duration },
            ...(computeSeconds === undefined
                ? {}
                : { pricingInput: { computeSeconds } }),
        },
    };
}
