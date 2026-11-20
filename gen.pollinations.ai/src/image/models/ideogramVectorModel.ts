import { UpstreamError } from "@shared/error.ts";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { closestRatioLogSpace } from "../utils/aspectRatio.ts";
import { falBillableUnits } from "../utils/falBillableUnits.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";
import {
    bufferToUint8Array,
    downloadUserImage,
} from "../utils/imageDownload.ts";

const SVG = "image/svg+xml";
const IDEOGRAM_RATIOS = [
    "1:1",
    "1:4",
    "1:3",
    "1:2",
    "9:16",
    "10:16",
    "2:3",
    "3:4",
    "4:5",
    "5:4",
    "4:3",
    "3:2",
    "16:10",
    "16:9",
    "2:1",
    "3:1",
    "4:1",
];

async function uploadFalReference(
    source: string,
    auth: string,
): Promise<string> {
    if (!source.startsWith("data:")) return source;
    const { buffer, mimeType } = await downloadUserImage(source);
    const upload = await fetchUpstream(
        "https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3",
        {
            method: "POST",
            headers: {
                Authorization: auth,
                "Content-Type": "application/json",
                "X-Fal-Object-Lifecycle-Preference": JSON.stringify({
                    expiration_duration_seconds: 3600,
                }),
            },
            body: JSON.stringify({
                file_name: `reference.${mimeType.split("/")[1]}`,
                content_type: mimeType,
            }),
            errorLabel: "fal could not prepare the reference upload",
        },
    );
    const { upload_url, file_url } = (await upload.json()) as {
        upload_url: string;
        file_url: string;
    };
    await fetchUpstream(upload_url, {
        method: "PUT",
        headers: { "Content-Type": mimeType },
        body: bufferToUint8Array(buffer),
        errorLabel: "fal could not upload the reference image",
    });
    return file_url;
}

export async function callIdeogramVectorAPI(
    prompt: string,
    params: ImageParams,
): Promise<ImageGenerationResult> {
    const key = getImageEnv("FAL_KEY");
    if (!key)
        throw UpstreamError.fromProvider(500, {
            message: "fal is not configured",
        });
    if (!["low", "medium", "high"].includes(params.quality)) {
        throw UpstreamError.fromProvider(400, {
            message: "Quality must be low, medium, or high",
        });
    }
    const auth = `Key ${key}`;
    const imageUrls = await Promise.all(
        params.image.map((source) => uploadFalReference(source, auth)),
    );
    const response = await fetchUpstream(
        "https://fal.run/ideogram/vector/text-to-vector",
        {
            method: "POST",
            headers: {
                Authorization: auth,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                prompt,
                quality: params.quality,
                aspect_ratio:
                    params.aspectRatio && params.aspectRatio !== "adaptive"
                        ? params.aspectRatio
                        : closestRatioLogSpace(
                              params.width,
                              params.height,
                              IDEOGRAM_RATIOS,
                          ),
                seed: params.seed,
                num_images: 1,
                ...(imageUrls.length && { image_urls: imageUrls }),
            }),
            errorLabel: "Ideogram SVG generation failed",
        },
    );
    const { images } = (await response.json()) as {
        images?: { url?: string; content_type?: string }[];
    };
    const image = images?.[0];
    if (!image?.url || image.content_type !== SVG) {
        throw UpstreamError.fromProvider(502, {
            message: "Ideogram returned no SVG",
        });
    }
    const completionImageTokens = falBillableUnits(response);
    const output = await fetchUpstream(image.url, {
        errorLabel: "Failed to download Ideogram SVG",
    });
    return {
        buffer: Buffer.from(await output.arrayBuffer()),
        mimeType: SVG,
        trackingData: {
            actualModel: params.model,
            usage: { completionImageTokens },
        },
    };
}
