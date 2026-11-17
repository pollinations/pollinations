import { UpstreamError } from "@shared/error.ts";
import { IMAGE_SERVICES } from "@shared/registry/image.ts";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { sleep } from "../util.ts";
import { closestRatioLogSpace } from "../utils/aspectRatio.ts";
import { falBillableUnits, falUnitPrice } from "../utils/falBillableUnits.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";

const WAN_3_TEXT_ENDPOINT_ID = "alibaba/wan-3.0-prime/text-to-video";
const WAN_3_IMAGE_ENDPOINT_ID = "alibaba/wan-3.0-prime/image-to-video";
const WAN_3_R2V_ENDPOINT_ID = "alibaba/wan-3.0-prime/reference-to-video";
const WAN_3_FAL_ROUTE = IMAGE_SERVICES["alibaba/wan-3.0:fal"];
const WAN_3_DEFAULT_DURATION_SECONDS = 5;
const WAN_3_POLL_INTERVAL_MS = 2_000;
const WAN_3_ASPECT_RATIOS = ["16:9", "4:3", "1:1", "3:4", "9:16"] as const;

interface FalQueueSubmission {
    status_url?: string;
    response_url?: string;
}

interface FalQueueStatus {
    status?: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
    error?: string;
}

interface FalWan3Result {
    duration?: number;
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

export async function callWan3FalAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<VideoGenerationResult> {
    const apiKey = getImageEnv("FAL_KEY");
    if (!apiKey)
        throw UpstreamError.fromProvider(500, {
            message: "Wan 3.0 is not configured",
        });

    const duration = safeParams.duration ?? WAN_3_DEFAULT_DURATION_SECONDS;

    const images = safeParams.image ?? [];
    const hasFrames = images.length > 0;
    const hasReference =
        (safeParams.reference_images?.length ?? 0) > 0 ||
        (safeParams.reference_videos?.length ?? 0) > 0 ||
        (safeParams.reference_audios?.length ?? 0) > 0;

    if (hasFrames && hasReference) {
        throw UpstreamError.fromProvider(400, {
            message:
                "Frame inputs (image[]) and reference media (reference_images, reference_videos, reference_audios) cannot be combined.",
        });
    }

    const resolution = safeParams.resolution ?? "480p";
    const authorization = { Authorization: `Key ${apiKey}` };

    const endpointId = hasReference
        ? WAN_3_R2V_ENDPOINT_ID
        : hasFrames
          ? WAN_3_IMAGE_ENDPOINT_ID
          : WAN_3_TEXT_ENDPOINT_ID;
    const body = {
        prompt,
        resolution,
        // Input media keeps its own shape unless the caller asked for one.
        aspect_ratio:
            hasFrames ||
            (hasReference &&
                !safeParams.aspectRatio &&
                !safeParams.dimensionsExplicit)
                ? "adaptive"
                : (safeParams.aspectRatio ??
                  closestRatioLogSpace(
                      safeParams.width,
                      safeParams.height,
                      WAN_3_ASPECT_RATIOS,
                  )),
        duration,
        audio: safeParams.audio ?? true,
        enable_prompt_expansion: true,
        enable_safety_checker: true,
        seed: safeParams.seed,
        ...(hasFrames
            ? {
                  start_image_url: images[0],
                  ...(images[1] ? { end_image_url: images[1] } : {}),
              }
            : {}),
        ...(safeParams.reference_images?.length
            ? { reference_image_urls: safeParams.reference_images }
            : {}),
        ...(safeParams.reference_videos?.length
            ? { reference_video_urls: safeParams.reference_videos }
            : {}),
        ...(safeParams.reference_audios?.length
            ? { reference_audio_urls: safeParams.reference_audios }
            : {}),
    };

    // Fetched before the paid submission, so a pricing failure costs nothing.
    const unitCost = await falUnitPrice(endpointId, apiKey);
    const submissionResponse = await fetchUpstream(
        `https://queue.fal.run/${endpointId}`,
        {
            method: "POST",
            headers: { ...authorization, "Content-Type": "application/json" },
            body: JSON.stringify(body),
            errorLabel: "Wan 3.0 submission failed",
        },
    );
    const submission = await readJson<FalQueueSubmission>(
        submissionResponse,
        "Wan 3.0 returned an invalid submission",
    );
    if (!submission.status_url || !submission.response_url) {
        throw UpstreamError.fromProvider(502, {
            message: "Wan 3.0 returned an invalid submission",
        });
    }

    while (true) {
        const statusResponse = await fetchUpstream(submission.status_url, {
            headers: authorization,
            errorLabel: "Wan 3.0 status check failed",
        });
        const status = await readJson<FalQueueStatus>(
            statusResponse,
            "Wan 3.0 returned an invalid status",
        );
        if (status.status === "COMPLETED") break;
        if (status.status === "FAILED") {
            throw UpstreamError.fromProvider(502, {
                message: status.error || "Wan 3.0 generation failed",
            });
        }
        if (status.status !== "IN_QUEUE" && status.status !== "IN_PROGRESS") {
            throw UpstreamError.fromProvider(502, {
                message: "Wan 3.0 returned an invalid status",
            });
        }
        await sleep(WAN_3_POLL_INTERVAL_MS);
    }

    const resultResponse = await fetchUpstream(submission.response_url, {
        headers: authorization,
        errorLabel: "Wan 3.0 result fetch failed",
    });
    const units = falBillableUnits(resultResponse);
    const result = await readJson<FalWan3Result>(
        resultResponse,
        "Wan 3.0 returned an invalid result",
    );
    if (!result.video?.url) {
        throw UpstreamError.fromProvider(502, {
            message: "Wan 3.0 returned no video",
        });
    }
    // Bill the generated length fal reports, not the requested one.
    const outputSeconds = result.duration;
    if (
        typeof outputSeconds !== "number" ||
        !Number.isFinite(outputSeconds) ||
        outputSeconds <= 0
    ) {
        throw UpstreamError.fromProvider(502, {
            message: "Wan 3.0 returned no video duration",
        });
    }
    // fal also bills the reference video seconds at the per-second rate, but
    // reports only the total. Recover them from that charge so the caller,
    // who pays per second, pays for them too.
    const rates =
        WAN_3_FAL_ROUTE.costVariants?.[resolution] ?? WAN_3_FAL_ROUTE.cost;
    const inputSeconds = safeParams.reference_videos?.length
        ? Math.round(
              ((units * unitCost) / Number(rates.promptVideoSeconds) -
                  outputSeconds) *
                  1000,
          ) / 1000
        : 0;

    const videoResponse = await fetchUpstream(result.video.url, {
        errorLabel: "Failed to download Wan 3.0 output",
    });
    return {
        buffer: Buffer.from(await videoResponse.arrayBuffer()),
        mimeType:
            result.video.content_type ||
            videoResponse.headers.get("content-type") ||
            "video/mp4",
        durationSeconds: outputSeconds,
        trackingData: {
            actualModel: safeParams.model,
            usage: {
                completionVideoSeconds: outputSeconds,
                ...(inputSeconds > 0
                    ? { promptVideoSeconds: inputSeconds }
                    : {}),
            },
            providerBilling: { units, unitCost },
        },
    };
}
