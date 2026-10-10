import { UpstreamError } from "@shared/error.ts";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { sleep } from "../util.ts";
import { closestRatioLogSpace } from "../utils/aspectRatio.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";

const KANDINSKY_BASE_ENDPOINT = "https://queue.fal.run/fal-ai";
const KANDINSKY_DURATION_SECONDS = 5;
const KANDINSKY_POLL_INTERVAL_MS = 2_000;
const KANDINSKY_ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4"] as const;

interface FalQueueSubmission {
    status_url?: string;
    response_url?: string;
}

interface FalQueueStatus {
    status?: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
    error?: string;
}

interface FalKandinskyResult {
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

export async function callKandinskyFalVideoAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<VideoGenerationResult> {
    const apiKey = getImageEnv("FAL_KEY");
    if (!apiKey) {
        throw UpstreamError.fromProvider(500, {
            message: "Kandinsky 6.0 is not configured",
        });
    }

    const duration = safeParams.duration ?? KANDINSKY_DURATION_SECONDS;
    if (duration !== KANDINSKY_DURATION_SECONDS) {
        throw UpstreamError.fromProvider(400, {
            message: "Kandinsky 6.0 supports exactly 5 seconds",
        });
    }

    const images = safeParams.image ?? [];
    const hasImage = images.length > 0;
    if (images.length > 1) {
        throw UpstreamError.fromProvider(400, {
            message:
                "Kandinsky 6.0 supports a start frame only (maximum 1 image)",
        });
    }

    const isPro = safeParams.model.endsWith("-pro");
    const variantPath = isPro ? "kandinsky6-pro" : "kandinsky6-lite";
    const taskPath = hasImage ? "image-to-video" : "text-to-video";
    const endpoint = `${KANDINSKY_BASE_ENDPOINT}/${variantPath}/${taskPath}`;

    const authorization = { Authorization: `Key ${apiKey}` };

    const body: Record<string, unknown> = {
        prompt,
        aspect_ratio: hasImage
            ? "auto"
            : closestRatioLogSpace(
                  safeParams.width,
                  safeParams.height,
                  KANDINSKY_ASPECT_RATIOS,
              ),
        generate_audio: safeParams.audio ?? true,
        enable_prompt_expansion: false,
        enable_safety_checker: true,
        seed: safeParams.seed,
    };

    if (hasImage) {
        body.image_url = images[0];
    }

    const submissionResponse = await fetchUpstream(endpoint, {
        method: "POST",
        headers: { ...authorization, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        errorLabel: "Kandinsky 6.0 submission failed",
    });

    const submission = await readJson<FalQueueSubmission>(
        submissionResponse,
        "Kandinsky 6.0 returned an invalid submission",
    );
    if (!submission.status_url || !submission.response_url) {
        throw UpstreamError.fromProvider(502, {
            message: "Kandinsky 6.0 returned an invalid submission",
        });
    }

    while (true) {
        const statusResponse = await fetchUpstream(submission.status_url, {
            headers: authorization,
            errorLabel: "Kandinsky 6.0 status check failed",
        });
        const status = await readJson<FalQueueStatus>(
            statusResponse,
            "Kandinsky 6.0 returned an invalid status",
        );
        if (status.status === "COMPLETED") break;
        if (status.status === "FAILED") {
            throw UpstreamError.fromProvider(502, {
                message: status.error || "Kandinsky 6.0 generation failed",
            });
        }
        if (status.status !== "IN_QUEUE" && status.status !== "IN_PROGRESS") {
            throw UpstreamError.fromProvider(502, {
                message: "Kandinsky 6.0 returned an invalid status",
            });
        }
        await sleep(KANDINSKY_POLL_INTERVAL_MS);
    }

    const resultResponse = await fetchUpstream(submission.response_url, {
        headers: authorization,
        errorLabel: "Kandinsky 6.0 result fetch failed",
    });
    const result = await readJson<FalKandinskyResult>(
        resultResponse,
        "Kandinsky 6.0 returned an invalid result",
    );
    if (!result.video?.url) {
        throw UpstreamError.fromProvider(502, {
            message: "Kandinsky 6.0 returned no video",
        });
    }

    const videoResponse = await fetchUpstream(result.video.url, {
        errorLabel: "Failed to download Kandinsky 6.0 output",
    });

    return {
        buffer: Buffer.from(await videoResponse.arrayBuffer()),
        mimeType:
            result.video.content_type ||
            videoResponse.headers.get("content-type") ||
            "video/mp4",
        durationSeconds: duration,
        trackingData: {
            actualModel: safeParams.model,
            usage: { completionVideoSeconds: duration },
        },
    };
}
