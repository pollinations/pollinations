import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import { sleep } from "../util.ts";
import { closestRatioLogSpace } from "../utils/aspectRatio.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";

const KREA_ENDPOINT = "https://queue.fal.run/krea/v2/medium/text-to-image";
const KREA_TIMEOUT_MS = 120_000;
const KREA_POLL_INTERVAL_MS = 1_000;
const KREA_ASPECT_RATIOS = [
    "1:1",
    "4:3",
    "3:2",
    "16:9",
    "2.35:1",
    "4:5",
    "2:3",
    "9:16",
] as const;

type KreaAspectRatio = (typeof KREA_ASPECT_RATIOS)[number];

const EXPLICIT_ASPECT_RATIOS: Partial<
    Record<NonNullable<ImageParams["aspectRatio"]>, KreaAspectRatio>
> = {
    "1:1": "1:1",
    "4:3": "4:3",
    "16:9": "16:9",
    "9:16": "9:16",
    "3:4": "4:5",
    "21:9": "2.35:1",
    "9:21": "9:16",
};

interface KreaResponse {
    images?: Array<{
        url?: string;
        content_type?: string;
    }>;
    seed?: number;
}

interface KreaQueueSubmission {
    status_url?: string;
    response_url?: string;
}

interface KreaQueueStatus {
    status?: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
    error?: string;
}

async function readJson<T>(
    response: Response,
    invalidMessage: string,
): Promise<T> {
    try {
        return (await response.json()) as T;
    } catch {
        throw new HttpError(invalidMessage, 502);
    }
}

function remainingTime(deadline: number): number {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
        throw new HttpError("Krea generation timed out", 504);
    }
    return remaining;
}

export function resolveKreaAspectRatio(
    safeParams: ImageParams,
): KreaAspectRatio {
    const explicit = safeParams.aspectRatio
        ? EXPLICIT_ASPECT_RATIOS[safeParams.aspectRatio]
        : undefined;
    return (
        explicit ??
        closestRatioLogSpace(
            safeParams.width,
            safeParams.height,
            KREA_ASPECT_RATIOS,
        )
    );
}

export async function callKreaImageAPI(
    prompt: string,
    safeParams: ImageParams,
): Promise<ImageGenerationResult> {
    if (safeParams.image.length > 0) {
        throw new HttpError("Krea does not accept image input", 400);
    }

    const apiKey = getImageEnv("FAL_KEY");
    if (!apiKey) {
        throw new HttpError("Krea is not configured", 500);
    }

    const deadline = Date.now() + KREA_TIMEOUT_MS;
    const submissionResponse = await fetchUpstream(KREA_ENDPOINT, {
        method: "POST",
        headers: {
            Authorization: `Key ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            prompt,
            aspect_ratio: resolveKreaAspectRatio(safeParams),
            creativity: "medium",
            seed: safeParams.seed,
        }),
        signal: AbortSignal.timeout(remainingTime(deadline)),
        errorLabel: "Krea submission failed",
    });
    const submission = await readJson<KreaQueueSubmission>(
        submissionResponse,
        "Krea returned an invalid submission",
    );
    if (!submission.status_url || !submission.response_url) {
        throw new HttpError("Krea returned an invalid submission", 502);
    }

    while (true) {
        const statusResponse = await fetchUpstream(submission.status_url, {
            headers: { Authorization: `Key ${apiKey}` },
            signal: AbortSignal.timeout(remainingTime(deadline)),
            errorLabel: "Krea status check failed",
        });
        const status = await readJson<KreaQueueStatus>(
            statusResponse,
            "Krea returned an invalid status",
        );
        if (status.status === "COMPLETED") break;
        if (status.status === "FAILED") {
            throw new HttpError(status.error || "Krea generation failed", 502);
        }
        if (status.status !== "IN_QUEUE" && status.status !== "IN_PROGRESS") {
            throw new HttpError("Krea returned an invalid status", 502);
        }
        await sleep(Math.min(KREA_POLL_INTERVAL_MS, remainingTime(deadline)));
    }

    const resultResponse = await fetchUpstream(submission.response_url, {
        headers: { Authorization: `Key ${apiKey}` },
        signal: AbortSignal.timeout(remainingTime(deadline)),
        errorLabel: "Krea result fetch failed",
    });
    const result = await readJson<KreaResponse>(
        resultResponse,
        "Krea returned invalid JSON",
    );

    const image = result.images?.[0];
    if (!image?.url) {
        throw new HttpError("Krea returned no image", 502);
    }

    const imageResponse = await fetchUpstream(image.url, {
        signal: AbortSignal.timeout(remainingTime(deadline)),
        errorLabel: "Failed to download Krea output",
    });

    return {
        buffer: Buffer.from(await imageResponse.arrayBuffer()),
        mimeType:
            image.content_type ||
            imageResponse.headers.get("content-type") ||
            undefined,
        isMature: false,
        isChild: false,
        trackingData: {
            actualModel: "krea",
            usage: { completionImageTokens: 1 },
        },
    };
}
