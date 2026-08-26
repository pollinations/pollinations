import debug from "debug";
import { fetchUserImage, MAX_IMAGE_SIZE, UserImageError } from "@/userImage.ts";
import { arrayBufferToBase64 } from "@/util.ts";
import type { TransformFn } from "../types.js";

const log = debug("pollinations:transforms:imageUrl");

const MAX_IMAGES_PER_REQUEST = 8;

/**
 * Inlines one image URL from a chat message.
 *
 * Redirects are refused on this path, unlike the image-generation one: these
 * URLs come from chat content rather than a parameter someone pasted a
 * shortener into, and a redirect lands on a host the URL guard never saw.
 */
async function fetchImageAsBase64(
    url: string,
    maxBytes: number,
): Promise<{ dataUrl: string; byteLength: number }> {
    const { bytes, mimeType } = await fetchUserImage(url, {
        maxBytes,
        redirect: "manual",
    });
    const base64 = arrayBufferToBase64(bytes);
    log(`Converted image to base64: ${mimeType}, ${base64.length} chars`);
    return {
        dataUrl: `data:${mimeType};base64,${base64}`,
        byteLength: bytes.byteLength,
    };
}

/**
 * Every caller-controlled HTTP(S) or data URL is decoded and rebuilt so
 * metadata stripping happens before provider delivery. GCS references are
 * internal provider-native objects that this worker cannot fetch directly.
 */
function needsSanitization(url: string | undefined): boolean {
    if (!url) return false;
    if (url.startsWith("gs://")) return false;
    return true;
}

interface ContentPart {
    type: string;
    image_url?: { url: string; [key: string]: unknown };
    [key: string]: unknown;
}

type ImageConversionContext = { imageCount: number; totalBytes: number };

async function processContentPart(
    part: ContentPart,
    context: ImageConversionContext,
): Promise<ContentPart> {
    if (part.type !== "image_url" || !part.image_url?.url) {
        return part;
    }

    if (!needsSanitization(part.image_url.url)) {
        return part;
    }

    context.imageCount += 1;
    if (context.imageCount > MAX_IMAGES_PER_REQUEST) {
        throw new UserImageError(
            `Too many image URLs in request (max ${MAX_IMAGES_PER_REQUEST}).`,
            "image_too_large",
        );
    }

    const remainingBytes = MAX_IMAGE_SIZE - context.totalBytes;
    const { dataUrl, byteLength } = await fetchImageAsBase64(
        part.image_url.url,
        remainingBytes,
    );
    context.totalBytes += byteLength;
    return {
        ...part,
        image_url: { ...part.image_url, url: dataUrl },
    };
}

async function processMessageContent(
    content: ContentPart[],
    context: ImageConversionContext,
): Promise<ContentPart[]> {
    const processed: ContentPart[] = [];
    for (const part of content) {
        processed.push(await processContentPart(part, context));
    }
    return processed;
}

/**
 * Converts caller-controlled images to sanitized base64 data URLs before any
 * text provider sees them. Besides satisfying providers that require inline
 * bytes, this prevents URL-forwarding providers from fetching the original
 * image with its EXIF/XMP/IPTC metadata intact.
 */
export const imageUrlToBase64Transform: TransformFn = async (
    messages,
    options,
) => {
    const config = options?.modelConfig as Record<string, unknown> | undefined;
    const provider = config?.provider as string | undefined;
    const providerInfo = provider ?? "unknown-provider";
    log(`Processing messages for ${providerInfo} image URL conversion`);

    const context: ImageConversionContext = {
        imageCount: 0,
        totalBytes: 0,
    };
    const processedMessages = [];
    for (const message of messages) {
        if (!message.content || typeof message.content === "string") {
            processedMessages.push(message);
            continue;
        }

        const processedContent = await processMessageContent(
            message.content as ContentPart[],
            context,
        );
        processedMessages.push({ ...message, content: processedContent });
    }

    log("Image URL conversion complete");
    return { messages: processedMessages, options };
};
