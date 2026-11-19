import { Buffer } from "node:buffer";
import { UpstreamError } from "@shared/error.ts";
import { detectImageMimeType } from "@shared/image-mime.ts";
import { signBedrockHeaders } from "../../text/auth/bedrock.ts";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { closestRatioLogSpace } from "../utils/aspectRatio.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import {
    base64ToBuffer,
    bufferToUint8Array,
    downloadUserImage,
    readImageDimensions,
} from "../utils/imageDownload.ts";

const BEDROCK_REGION = "us-west-2";
const STABILITY_IMAGE_ROUTES = {
    sd35: { bedrock: "stability.sd3-5-large-v1:0", direct: "sd3" },
    core: { bedrock: "stability.stable-image-core-v1:1", direct: "core" },
} as const;
const STABILITY_ASPECT_RATIOS = [
    "1:1",
    "16:9",
    "9:16",
    "3:2",
    "2:3",
    "4:5",
    "5:4",
    "21:9",
    "9:21",
] as const;

export async function callStabilityImage(
    prompt: string,
    params: ImageParams,
    variant: keyof typeof STABILITY_IMAGE_ROUTES,
): Promise<ImageGenerationResult> {
    const route = STABILITY_IMAGE_ROUTES[variant];
    const image = params.image?.[0];
    const reference = image ? await downloadUserImage(image) : undefined;
    if (reference) {
        const dimensions = readImageDimensions(
            reference.buffer,
            reference.mimeType,
        );
        if (
            !["image/png", "image/jpeg", "image/webp"].includes(
                reference.mimeType,
            ) ||
            !dimensions ||
            Math.min(dimensions.width, dimensions.height) < 64
        ) {
            throw UpstreamError.fromProvider(400, {
                message:
                    "The reference must be a PNG, JPEG or WebP image at least 64 pixels per side.",
            });
        }
    }

    const ratio =
        STABILITY_ASPECT_RATIOS.find((ratio) => ratio === params.aspectRatio) ??
        closestRatioLogSpace(
            params.width,
            params.height,
            STABILITY_ASPECT_RATIOS,
        );
    const fields = {
        prompt,
        seed: params.seed,
        output_format: "png",
        ...(variant === "sd35"
            ? { mode: reference ? "image-to-image" : "text-to-image" }
            : {}),
        ...(reference ? { strength: 0.55 } : { aspect_ratio: ratio }),
    };
    const signal = AbortSignal.timeout(60_000);

    let buffer: Buffer;
    if (params.model.endsWith(":stability")) {
        const apiKey = getImageEnv("STABILITY_API_KEY");
        if (!apiKey) {
            throw UpstreamError.fromProvider(500, {
                message: "The direct Stability image route is not configured.",
            });
        }
        const form = new FormData();
        for (const [key, value] of Object.entries(fields)) {
            form.set(key, String(value));
        }
        if (variant === "sd35") form.set("model", "sd3.5-large");
        if (reference) {
            form.set(
                "image",
                new Blob([bufferToUint8Array(reference.buffer)], {
                    type: reference.mimeType,
                }),
                "reference",
            );
        }
        const response = await fetchUpstream(
            `https://api.stability.ai/v2beta/stable-image/generate/${route.direct}`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    Accept: "image/*",
                },
                body: form,
                signal,
            },
        );
        buffer = Buffer.from(await response.arrayBuffer());
    } else {
        const accessKeyId = getImageEnv("AWS_ACCESS_KEY_ID");
        const secretAccessKey = getImageEnv("AWS_SECRET_ACCESS_KEY");
        if (!accessKeyId || !secretAccessKey) {
            throw UpstreamError.fromProvider(500, {
                message: "The Bedrock image route is not configured.",
            });
        }
        const url = new URL(
            `https://bedrock-runtime.${BEDROCK_REGION}.amazonaws.com/model/${route.bedrock}/invoke`,
        );
        const body = JSON.stringify({
            ...fields,
            ...(reference
                ? { image: reference.buffer.toString("base64") }
                : {}),
        });
        const headers = await signBedrockHeaders(
            url,
            body,
            { "content-type": "application/json", accept: "application/json" },
            { accessKeyId, secretAccessKey, region: BEDROCK_REGION },
        );
        const response = await fetchUpstream(url.href, {
            method: "POST",
            headers,
            body,
            signal,
        });
        const result = (await response.json()) as {
            images?: string[];
            finish_reasons?: (string | null)[];
        };
        if (result.finish_reasons?.[0]?.startsWith("Filter reason:")) {
            throw UpstreamError.fromProvider(400, {
                message:
                    "Stability rejected the request or output under its content policy.",
            });
        }
        buffer = base64ToBuffer(result.images?.[0] ?? "");
    }
    if (detectImageMimeType(buffer) !== "image/png") {
        throw UpstreamError.fromProvider(502, {
            message: "Stability returned no valid PNG image.",
        });
    }

    return {
        buffer,
        trackingData: {
            actualModel: params.model,
            usage: { completionImageTokens: 1 },
        },
    };
}
