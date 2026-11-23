import { UpstreamError } from "@shared/error.ts";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import debug from "debug";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { sleep } from "../util.ts";
import { closestRatioLogSpace } from "../utils/aspectRatio.ts";
import { fetchFalVideo, runAzureFalVideo } from "../utils/azureFalVideo.ts";
import { falBillableUnits } from "../utils/falBillableUnits.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";

const logOps = debug("pollinations:kling:ops");

const KLING_MODELS = {
    "kwaivgi/kling-v3.0-std": "v3/standard",
    "kwaivgi/kling-v3.0-pro": "v3/pro",
    "kwaivgi/kling-v4.0-flash": "v4/flash",
} as const;
type KlingModel = keyof typeof KLING_MODELS;
const KLING_UNIT_PRICES = {
    "kwaivgi/kling-v3.0-std": 0.14,
    "kwaivgi/kling-v3.0-pro": 0.14,
    "kwaivgi/kling-v4.0-flash": 0.094,
} as const;
const KLING_POLL_INTERVAL_MS = 3_000;
// Text-to-video's aspect_ratio enum; image-to-video has no such field and
// instead follows the supplied start image.
const KLING_ASPECT_RATIOS = ["16:9", "9:16", "1:1"] as const;
const KLING_FLASH_ASPECT_RATIOS = [
    ...KLING_ASPECT_RATIOS,
    "4:3",
    "3:4",
    "21:9",
] as const;

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
        duration?: number;
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

async function generateFalKling(
    model: KlingModel,
    operation: "text-to-video" | "image-to-video",
    requestBody: Record<string, unknown>,
) {
    const apiKey = getImageEnv("FAL_KEY");
    if (!apiKey) {
        throw UpstreamError.fromProvider(500, {
            message: "FAL_KEY environment variable is required",
        });
    }

    const endpoint = `https://queue.fal.run/fal-ai/kling-video/${KLING_MODELS[model]}/${operation}`;
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
    return resultResponse;
}

export async function callKlingVideoAPI(
    prompt: string,
    safeParams: ImageParams,
    model:
        | KlingModel
        | "kwaivgi/kling-v3.0-pro:azure" = "kwaivgi/kling-v3.0-std",
): Promise<VideoGenerationResult> {
    const duration = safeParams.duration ?? 5;
    const isFlash = model === "kwaivgi/kling-v4.0-flash";
    const generateAudio = !isFlash && safeParams.audio === true;
    const [startImage, endImage] = safeParams.image ?? [];
    const isImageToVideo = Boolean(startImage);

    const requestBody: Record<string, unknown> = {
        prompt,
        duration: isFlash ? duration : String(duration),
        ...(isFlash
            ? {}
            : { generate_audio: generateAudio, seed: safeParams.seed }),
    };
    if (isImageToVideo) {
        requestBody.start_image_url = startImage;
        if (endImage && !isFlash) {
            requestBody.end_image_url = endImage;
        }
    } else {
        const aspectRatios = isFlash
            ? KLING_FLASH_ASPECT_RATIOS
            : KLING_ASPECT_RATIOS;
        if (
            safeParams.aspectRatio !== undefined &&
            !aspectRatios.some((ratio) => ratio === safeParams.aspectRatio)
        ) {
            throw new UpstreamError(400, {
                message: `Kling text-to-video supports aspectRatio ${aspectRatios.slice(0, -1).join(", ")}, or ${aspectRatios.at(-1)}`,
            });
        }
        requestBody.aspect_ratio =
            safeParams.aspectRatio ??
            closestRatioLogSpace(
                safeParams.width,
                safeParams.height,
                aspectRatios,
            );
    }

    const operation = isImageToVideo ? "image-to-video" : "text-to-video";
    const azure = model === "kwaivgi/kling-v3.0-pro:azure";
    const resultResponse = azure
        ? await runAzureFalVideo(
              "Fal-Kling-V3-Pro",
              "kling/v3/pro",
              operation,
              requestBody,
          )
        : await generateFalKling(model, operation, requestBody);
    const result = await readJson<KlingResult>(
        resultResponse,
        "Kling returned an invalid result",
    );
    if (!result.video?.url)
        throw UpstreamError.fromProvider(502, {
            message: "Kling returned no video",
        });
    // Azure's queue can omit usage. Prefer reported duration when available.
    let billedSeconds = result.video.duration ?? duration;
    if (!azure || resultResponse.headers.has("x-fal-billable-units")) {
        const baseModel = azure ? "kwaivgi/kling-v3.0-pro" : model;
        const rates = IMAGE_SERVICES[baseModel].cost;
        const audioRate =
            generateAudio && "completionAudioSeconds" in rates
                ? Number(rates.completionAudioSeconds ?? 0)
                : 0;
        const rate = rates.completionVideoSeconds + audioRate;
        const unitPrice =
            KLING_UNIT_PRICES[azure ? "kwaivgi/kling-v3.0-pro" : model];
        billedSeconds = Number(
            ((falBillableUnits(resultResponse) * unitPrice) / rate).toFixed(9),
        );
    }
    const videoResponse = azure
        ? await fetchFalVideo(
              result.video.url,
              "Failed to download Kling output",
          )
        : await fetchKlingRead(result.video.url, {
              errorLabel: "Failed to download Kling output",
          });
    logOps("Kling generation complete", {
        duration,
        generateAudio: isFlash || generateAudio,
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
            actualModel: model,
            usage: {
                completionVideoSeconds: billedSeconds,
                ...(generateAudio
                    ? { completionAudioSeconds: billedSeconds }
                    : {}),
            },
        },
    };
}
