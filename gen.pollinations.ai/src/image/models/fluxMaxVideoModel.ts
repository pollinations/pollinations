import { UpstreamError } from "@shared/error.ts";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { sleep } from "../util.ts";
import { closestRatioLogSpace } from "../utils/aspectRatio.ts";
import { falBillableUnits, falUnitPrice } from "../utils/falBillableUnits.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";

const FLUX_MAX_MODEL = "black-forest-labs/flux-3-max";
const FLUX_MAX_TEXT_ENDPOINT_ID = "blackforestlabs/flux-3-max/text-to-video";
const FLUX_MAX_IMAGE_ENDPOINT_ID = "blackforestlabs/flux-3-max/image-to-video";
const FLUX_MAX_POLL_INTERVAL_MS = 3_000;
const FLUX_MAX_ASPECT_RATIOS = [
    "21:9",
    "2:1",
    "16:9",
    "4:3",
    "1:1",
    "3:4",
    "9:16",
] as const;

interface FalQueueSubmission {
    status_url?: string;
    response_url?: string;
}

interface FalQueueStatus {
    status?: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
    error?: string;
}

interface FluxMaxResult {
    video?: {
        url?: string;
        content_type?: string;
    };
}

async function readJson<T>(response: Response, message: string): Promise<T> {
    try {
        return (await response.json()) as T;
    } catch {
        throw UpstreamError.fromProvider(502, { message });
    }
}

// Retrying a status/result GET is safe; never retry the paid submission.
// fal can keep running and billing the job after a polling connection drops.
async function fetchFluxMaxRead(
    url: string,
    options: Parameters<typeof fetchUpstream>[1],
) {
    for (let attempt = 0; ; attempt++) {
        try {
            return await fetchUpstream(url, options);
        } catch (error) {
            if (
                !(error instanceof UpstreamError) ||
                error.status < 500 ||
                attempt >= 2
            )
                throw error;
            await sleep(FLUX_MAX_POLL_INTERVAL_MS);
        }
    }
}

// An explicit aspectRatio wins. Text prompts without one take the shape of
// explicit dimensions. Image-to-video without one follows the start image.
function fluxMaxAspectRatio(
    safeParams: ImageParams,
    isImageToVideo: boolean,
): string | undefined {
    const requested = safeParams.aspectRatio;
    if (requested !== undefined) {
        if (!FLUX_MAX_ASPECT_RATIOS.some((ratio) => ratio === requested)) {
            throw UpstreamError.fromProvider(400, {
                message: `FLUX 3 Max does not support aspectRatio ${requested}`,
            });
        }
        return requested;
    }
    if (isImageToVideo || !safeParams.dimensionsExplicit) return undefined;
    return closestRatioLogSpace(
        safeParams.width,
        safeParams.height,
        FLUX_MAX_ASPECT_RATIOS,
    );
}

export async function callFluxMaxVideoAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<VideoGenerationResult> {
    const apiKey = getImageEnv("FAL_KEY");
    if (!apiKey) {
        throw UpstreamError.fromProvider(500, {
            message: "FAL_KEY environment variable is required",
        });
    }

    const duration = safeParams.duration ?? 5;
    if (!Number.isInteger(duration) || duration < 5 || duration > 20) {
        throw UpstreamError.fromProvider(400, {
            message: "FLUX 3 Max supports whole-second durations from 5 to 20",
        });
    }
    const [startImage, endImage] = safeParams.image ?? [];
    const isImageToVideo = Boolean(startImage);
    const aspectRatio = fluxMaxAspectRatio(safeParams, isImageToVideo);

    const requestBody: Record<string, unknown> = {
        prompt,
        resolution: safeParams.resolution ?? "720p",
        duration,
        generate_audio: safeParams.audio ?? true,
        seed: safeParams.seed,
        ...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
    };
    if (isImageToVideo) {
        requestBody.image_url = startImage;
        if (endImage) requestBody.end_image_url = endImage;
    }
    const endpointId = isImageToVideo
        ? FLUX_MAX_IMAGE_ENDPOINT_ID
        : FLUX_MAX_TEXT_ENDPOINT_ID;
    const endpoint = `https://queue.fal.run/${endpointId}`;
    const authorization = { Authorization: `Key ${apiKey}` };
    // fal's units are resolution-weighted, not seconds: charge them at fal's
    // live unit price, fetched before the paid submission.
    const unitCost = await falUnitPrice(endpointId, apiKey);

    const submissionResponse = await fetchUpstream(endpoint, {
        method: "POST",
        headers: { ...authorization, "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        errorLabel: "FLUX 3 Max submission failed",
    });
    const submission = await readJson<FalQueueSubmission>(
        submissionResponse,
        "FLUX 3 Max returned an invalid submission",
    );
    if (!submission.status_url || !submission.response_url) {
        throw UpstreamError.fromProvider(502, {
            message: "FLUX 3 Max returned an invalid submission",
        });
    }

    while (true) {
        const statusResponse = await fetchFluxMaxRead(submission.status_url, {
            headers: authorization,
            errorLabel: "FLUX 3 Max status check failed",
        });
        const status = await readJson<FalQueueStatus>(
            statusResponse,
            "FLUX 3 Max returned an invalid status",
        );
        if (status.status === "COMPLETED") break;
        if (status.status === "FAILED") {
            throw UpstreamError.fromProvider(502, {
                message: status.error || "FLUX 3 Max generation failed",
            });
        }
        if (status.status !== "IN_QUEUE" && status.status !== "IN_PROGRESS") {
            throw UpstreamError.fromProvider(502, {
                message: "FLUX 3 Max returned an invalid status",
            });
        }
        await sleep(FLUX_MAX_POLL_INTERVAL_MS);
    }

    const resultResponse = await fetchFluxMaxRead(submission.response_url, {
        headers: authorization,
        errorLabel: "FLUX 3 Max result fetch failed",
    });
    const units = falBillableUnits(resultResponse);
    const result = await readJson<FluxMaxResult>(
        resultResponse,
        "FLUX 3 Max returned an invalid result",
    );
    if (!result.video?.url) {
        throw UpstreamError.fromProvider(502, {
            message: "FLUX 3 Max returned no video",
        });
    }

    const videoResponse = await fetchFluxMaxRead(result.video.url, {
        errorLabel: "Failed to download FLUX 3 Max output",
    });

    return {
        buffer: Buffer.from(await videoResponse.arrayBuffer()),
        mimeType:
            result.video.content_type ||
            videoResponse.headers.get("content-type") ||
            "video/mp4",
        durationSeconds: duration,
        trackingData: {
            actualModel: FLUX_MAX_MODEL,
            usage: { completionVideoSeconds: duration },
            providerBilling: { units, unitCost },
        },
    };
}
