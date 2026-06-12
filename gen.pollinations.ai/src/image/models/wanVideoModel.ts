/**
 * Alibaba Wan video generation via Replicate.
 *
 * Moved off Alibaba DashScope (provider consolidation onto Replicate, which we
 * already use for Seedance). Replicate splits text-to-video and image-to-video
 * into separate models, so each variant routes by whether a first frame is
 * supplied:
 *   - wan-fast → wan-2.2-t2v-fast / wan-2.2-i2v-fast  (480p, ~5s, silent)
 *   - wan      → wan-2.6-t2v      / wan-2.6-i2v       (720p, native audio)
 *   - wan-pro  → wan-2.7-t2v      / wan-2.7-i2v       (720p, native audio)
 *
 * ONE PRICE PER MODEL: Replicate prices Wan video per-second by resolution
 * (720p vs 1080p) — so each model is LOCKED to a single resolution to keep a
 * single rate. wan/wan-pro lock to 720p ($0.10/s, audio bundled); wan-fast
 * locks to 480p (flat $0.05 per fixed-length clip). 1080p, if ever wanted,
 * would be a separate model. This mirrors the Seedance 720p-locked convention.
 */

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
} from "../utils/replicateClient.ts";

const logOps = debug("pollinations:wan:ops");
const logError = debug("pollinations:wan:error");

interface WanVariantConfig {
    t2vModel: string;
    i2vModel: string;
    trackingName: string;
    displayName: string;
    /**
     * Build the Replicate input for the chosen mode. `frames` holds the
     * already-downloaded data URIs: frames[0] = first frame, frames[1] = last.
     */
    buildInput(
        mode: "t2v" | "i2v",
        prompt: string,
        safeParams: ImageParams,
        frames: string[],
    ): Record<string, unknown>;
    /** Resolve the duration to request AND bill (seconds). */
    resolveDuration(safeParams: ImageParams): number;
}

// wan-2.2-fast: aspect_ratio enum is landscape/portrait only.
const WAN_FAST_RATIOS = ["16:9", "9:16"] as const;
// wan-2.7-t2v aspect_ratio enum.
const WAN_PRO_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4"] as const;
// wan-2.2-fast is a fixed ~5s clip (81 frames @ 16fps); bill a flat 5s.
const WAN_FAST_FIXED_SECONDS = 5;
// wan-2.6 duration is an enum; wan-2.7 a free integer we clamp.
const WAN_26_DURATIONS = [5, 10, 15] as const;
const WAN_PRO_MIN_DURATION = 2;
const WAN_PRO_MAX_DURATION = 15;

/** Pick the supported aspect ratio closest to the request. */
function pickAspect<T extends string>(
    safeParams: ImageParams,
    ratios: readonly T[],
): T {
    const requested = safeParams.aspectRatio;
    if (requested && (ratios as readonly string[]).includes(requested)) {
        return requested as T;
    }
    if (safeParams.width && safeParams.height) {
        return closestRatioLogSpace(
            safeParams.width,
            safeParams.height,
            ratios,
        );
    }
    return ratios[0];
}

/** Snap a requested duration to the nearest value in an allowed set. */
function snapDuration(
    requested: number | undefined,
    allowed: readonly number[],
): number {
    const target = requested ?? allowed[0];
    return allowed.reduce((best, d) =>
        Math.abs(d - target) < Math.abs(best - target) ? d : best,
    );
}

function withSeed(
    input: Record<string, unknown>,
    safeParams: ImageParams,
): Record<string, unknown> {
    if (safeParams.seed !== undefined && safeParams.seed !== -1) {
        input.seed = safeParams.seed;
    }
    return input;
}

const WAN_FAST_CONFIG: WanVariantConfig = {
    t2vModel: "wan-video/wan-2.2-t2v-fast",
    i2vModel: "wan-video/wan-2.2-i2v-fast",
    trackingName: "wan-fast",
    displayName: "Wan 2.2",
    resolveDuration: () => WAN_FAST_FIXED_SECONDS,
    buildInput(mode, prompt, safeParams, frames) {
        if (mode === "i2v") {
            return withSeed(
                {
                    prompt,
                    image: frames[0],
                    resolution: "480p",
                    ...(frames[1] ? { last_image: frames[1] } : {}),
                },
                safeParams,
            );
        }
        return withSeed(
            {
                prompt,
                resolution: "480p",
                aspect_ratio: pickAspect(safeParams, WAN_FAST_RATIOS),
            },
            safeParams,
        );
    },
};

const WAN_26_CONFIG: WanVariantConfig = {
    t2vModel: "wan-video/wan-2.6-t2v",
    i2vModel: "wan-video/wan-2.6-i2v",
    trackingName: "wan",
    displayName: "Wan 2.6",
    resolveDuration: (p) => snapDuration(p.duration, WAN_26_DURATIONS),
    buildInput(mode, prompt, safeParams, frames) {
        const duration = snapDuration(safeParams.duration, WAN_26_DURATIONS);
        if (mode === "i2v") {
            return withSeed(
                { prompt, image: frames[0], resolution: "720p", duration },
                safeParams,
            );
        }
        // t2v uses an explicit size; lock to the 720p landscape/portrait pair.
        const size =
            pickAspect(safeParams, WAN_FAST_RATIOS) === "9:16"
                ? "720*1280"
                : "1280*720";
        return withSeed({ prompt, size, duration }, safeParams);
    },
};

// Wan 2.7 is offered at two locked resolutions as separate models (one price
// each): wan-pro @720p ($0.10/s) and wan-pro-1080p @1080p ($0.15/s). The t2v/i2v
// schemas are identical apart from the resolution value, so share a factory.
function makeWan27Config(
    resolution: "720p" | "1080p",
    trackingName: string,
): WanVariantConfig {
    return {
        t2vModel: "wan-video/wan-2.7-t2v",
        i2vModel: "wan-video/wan-2.7-i2v",
        trackingName,
        displayName: `Wan 2.7${resolution === "1080p" ? " 1080p" : ""}`,
        resolveDuration: (p) =>
            Math.max(
                WAN_PRO_MIN_DURATION,
                Math.min(WAN_PRO_MAX_DURATION, Math.floor(p.duration ?? 5)),
            ),
        buildInput(mode, prompt, safeParams, frames) {
            const duration = this.resolveDuration(safeParams);
            if (mode === "i2v") {
                return withSeed(
                    {
                        prompt,
                        first_frame: frames[0],
                        resolution,
                        duration,
                        ...(frames[1] ? { last_frame: frames[1] } : {}),
                    },
                    safeParams,
                );
            }
            return withSeed(
                {
                    prompt,
                    resolution,
                    aspect_ratio: pickAspect(safeParams, WAN_PRO_RATIOS),
                    duration,
                },
                safeParams,
            );
        },
    };
}

const WAN_27_CONFIG = makeWan27Config("720p", "wan-pro");
const WAN_27_1080P_CONFIG = makeWan27Config("1080p", "wan-pro-1080p");

async function generateWanVideo(
    config: WanVariantConfig,
    prompt: string,
    safeParams: ImageParams,
): Promise<VideoGenerationResult> {
    const images = safeParams.image ?? [];
    if (images.length > 2) {
        throw new HttpError(
            `${config.displayName} supports at most two frames: image[0] as first frame and image[1] as last frame.`,
            400,
        );
    }
    const mode: "t2v" | "i2v" = images.length > 0 ? "i2v" : "t2v";
    const model = mode === "i2v" ? config.i2vModel : config.t2vModel;

    const frames =
        images.length > 0 ? await Promise.all(images.map(toDataUri)) : [];
    const input = config.buildInput(mode, prompt, safeParams, frames);
    const requestedDuration = config.resolveDuration(safeParams);

    logOps(`${config.displayName} (${mode}) input:`, {
        ...input,
        prompt: prompt.slice(0, 80),
        image: input.image ? "[data uri]" : undefined,
        first_frame: input.first_frame ? "[data uri]" : undefined,
        last_image: input.last_image ? "[data uri]" : undefined,
        last_frame: input.last_frame ? "[data uri]" : undefined,
    });

    let videoUrl: string;
    let actualDurationSeconds: number | undefined;
    try {
        const result = await runReplicatePrediction<typeof input, string>({
            model,
            input,
        });
        videoUrl = result.output;
        actualDurationSeconds = result.videoOutputDurationSeconds;
        logOps(`${config.displayName} prediction succeeded:`, {
            id: result.id,
            predict_time: result.predictTimeSeconds,
            video_output_duration: actualDurationSeconds,
        });
    } catch (err) {
        logError(`${config.displayName} prediction call failed:`, err);
        if (err instanceof ReplicateError) {
            throw new HttpError(
                `${config.displayName} generation failed: ${err.message}`,
                err.status ?? 500,
            );
        }
        throw err;
    }

    const videoResponse = await fetchUpstream(videoUrl, {
        errorLabel: `Failed to download ${config.displayName} output video`,
    });
    const buffer = Buffer.from(await videoResponse.arrayBuffer());
    logOps(
        `${config.displayName} video downloaded:`,
        (buffer.length / 1024 / 1024).toFixed(2),
        "MB",
    );

    // Bill on Replicate's reported output length when available, else the
    // requested duration. Audio is bundled into the per-second video rate (or
    // absent on wan-fast), so there is no separate audio line.
    const billedDuration = actualDurationSeconds ?? requestedDuration;

    return {
        buffer,
        mimeType: "video/mp4",
        durationSeconds: requestedDuration,
        trackingData: {
            actualModel: config.trackingName,
            usage: {
                completionVideoSeconds: billedDuration,
            },
        },
    };
}

/** Wan 2.6 via Replicate — T2V / I2V at 720p with native audio. */
export function callWanAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<VideoGenerationResult> {
    return generateWanVideo(WAN_26_CONFIG, prompt, safeParams);
}

/** Wan 2.2 fast via Replicate — T2V / I2V at 480p, silent, ~5s. */
export function callWanFastAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<VideoGenerationResult> {
    return generateWanVideo(WAN_FAST_CONFIG, prompt, safeParams);
}

/** Wan 2.7 via Replicate — T2V / I2V at 720p with native audio + keyframes. */
export function callWanProAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<VideoGenerationResult> {
    return generateWanVideo(WAN_27_CONFIG, prompt, safeParams);
}

/** Wan 2.7 via Replicate at locked 1080p (billed at the higher i2v rate). */
export function callWanPro1080pAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<VideoGenerationResult> {
    return generateWanVideo(WAN_27_1080P_CONFIG, prompt, safeParams);
}
