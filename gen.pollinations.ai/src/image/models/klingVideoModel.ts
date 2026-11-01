import { UpstreamError } from "@shared/error.ts";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import debug from "debug";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { sleep } from "../util.ts";
import { closestRatioLogSpace } from "../utils/aspectRatio.ts";
import { falBillableUnits } from "../utils/falBillableUnits.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";

const logOps = debug("pollinations:kling:ops");

const KLING_MODEL = "kwaivgi/kling-v3.0-std";
const KLING_TEXT_ENDPOINT =
    "https://queue.fal.run/fal-ai/kling-video/v3/standard/text-to-video";
const KLING_IMAGE_ENDPOINT =
    "https://queue.fal.run/fal-ai/kling-video/v3/standard/image-to-video";
const KLING_POLL_INTERVAL_MS = 3_000;
// Text-to-video's aspect_ratio enum; image-to-video has no such field and
// instead follows the supplied start image.
const KLING_ASPECT_RATIOS = ["16:9", "9:16", "1:1"] as const;

interface FalQueueSubmission {
    status_url?: string;
    response_url?: string;
}

interface FalQueueStatus {
    status?: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
    error?: string;
}

interface KlingResult {
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
async function fetchKlingRead(
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
            await sleep(KLING_POLL_INTERVAL_MS);
        }
    }
}

export async function callKlingVideoAPI(
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
    if (!Number.isInteger(duration) || duration < 3 || duration > 15) {
        throw UpstreamError.fromProvider(400, {
            message: "Kling duration must be an integer from 3 to 15 seconds",
        });
    }
    const generateAudio = safeParams.audio === true;
    const [startImage, endImage] = safeParams.image ?? [];
    const isImageToVideo = Boolean(startImage);

    const requestBody: Record<string, unknown> = {
        prompt,
        duration: String(duration),
        generate_audio: generateAudio,
        seed: safeParams.seed,
    };
    if (isImageToVideo) {
        requestBody.start_image_url = startImage;
        if (endImage) requestBody.end_image_url = endImage;
    } else {
        if (
            safeParams.aspectRatio !== undefined &&
            !KLING_ASPECT_RATIOS.some(
                (ratio) => ratio === safeParams.aspectRatio,
            )
        ) {
            throw new UpstreamError(400, {
                message:
                    "Kling text-to-video supports aspectRatio 16:9, 9:16, or 1:1",
            });
        }
        requestBody.aspect_ratio =
            safeParams.aspectRatio ??
            closestRatioLogSpace(
                safeParams.width,
                safeParams.height,
                KLING_ASPECT_RATIOS,
            );
    }

    const endpoint = isImageToVideo
        ? KLING_IMAGE_ENDPOINT
        : KLING_TEXT_ENDPOINT;
    const authorization = { Authorization: `Key ${apiKey}` };

    const submissionResponse = await fetchUpstream(endpoint, {
        method: "POST",
        headers: { ...authorization, "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        errorLabel: "Kling submission failed",
    });
    const submission = await readJson<FalQueueSubmission>(
        submissionResponse,
        "Kling returned an invalid submission",
    );
    if (!submission.status_url || !submission.response_url) {
        throw UpstreamError.fromProvider(502, {
            message: "Kling returned an invalid submission",
        });
    }

    while (true) {
        const statusResponse = await fetchKlingRead(submission.status_url, {
            headers: authorization,
            errorLabel: "Kling status check failed",
        });
        const status = await readJson<FalQueueStatus>(
            statusResponse,
            "Kling returned an invalid status",
        );
        if (status.status === "COMPLETED") break;
        if (status.status === "FAILED") {
            throw UpstreamError.fromProvider(502, {
                message: status.error || "Kling generation failed",
            });
        }
        if (status.status !== "IN_QUEUE" && status.status !== "IN_PROGRESS") {
            throw UpstreamError.fromProvider(502, {
                message: "Kling returned an invalid status",
            });
        }
        await sleep(KLING_POLL_INTERVAL_MS);
    }

    const resultResponse = await fetchKlingRead(submission.response_url, {
        headers: authorization,
        errorLabel: "Kling result fetch failed",
    });
    // fal reports normalized seconds priced at $0.14/unit for both endpoints.
    // Convert the reported quantity to the registry's silent/audio second rate;
    // never substitute the requested duration for the provider's billed usage.
    const rates = IMAGE_SERVICES[KLING_MODEL].cost;
    const rate =
        rates.completionVideoSeconds +
        (generateAudio ? rates.completionAudioSeconds : 0);
    const billedSeconds = Number(
        ((falBillableUnits(resultResponse) * 0.14) / rate).toFixed(9),
    );
    const result = await readJson<KlingResult>(
        resultResponse,
        "Kling returned an invalid result",
    );
    if (!result.video?.url) {
        throw UpstreamError.fromProvider(502, {
            message: "Kling returned no video",
        });
    }

    const videoResponse = await fetchKlingRead(result.video.url, {
        errorLabel: "Failed to download Kling output",
    });

    logOps("Kling generation complete", {
        duration,
        generateAudio,
        isImageToVideo,
    });

    return {
        buffer: Buffer.from(await videoResponse.arrayBuffer()),
        mimeType:
            result.video.content_type ||
            videoResponse.headers.get("content-type") ||
            "video/mp4",
        durationSeconds: duration,
        trackingData: {
            actualModel: KLING_MODEL,
            usage: {
                completionVideoSeconds: billedSeconds,
                ...(generateAudio
                    ? { completionAudioSeconds: billedSeconds }
                    : {}),
            },
        },
    };
}
