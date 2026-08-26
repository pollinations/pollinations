import { HttpError } from "@shared/http-error.ts";
import type { ImageParams } from "../params.ts";

export interface ReferenceMediaCaps {
    title: string;
    maxImages: number;
    maxVideos: number;
    maxAudios: number;
}

export interface ResolvedReferenceMedia {
    images: string[];
    videos: string[];
    audios: string[];
}

// Shared Seedance reference-media validation. Reference media are an
// alternative to first/last-frame images, never a combination, and reference
// audios need a visual anchor. Returns URL lists passed through to Replicate,
// which fetches http(s) sources directly.
export function resolveReferenceMedia(
    safeParams: Pick<
        ImageParams,
        "image" | "reference_images" | "reference_videos" | "reference_audios"
    >,
    caps: ReferenceMediaCaps,
): ResolvedReferenceMedia {
    const images = safeParams.reference_images ?? [];
    const videos = safeParams.reference_videos ?? [];
    const audios = safeParams.reference_audios ?? [];

    if (
        safeParams.image.length > 0 &&
        (images.length > 0 || videos.length > 0 || audios.length > 0)
    ) {
        throw new HttpError(
            `${caps.title} cannot combine reference media with first/last-frame images. Send either image[] frames or reference media, not both.`,
            400,
        );
    }
    if (images.length > caps.maxImages) {
        throw new HttpError(
            `${caps.title} supports at most ${caps.maxImages} reference images.`,
            400,
        );
    }
    if (videos.length > caps.maxVideos) {
        throw new HttpError(
            `${caps.title} supports at most ${caps.maxVideos} reference videos.`,
            400,
        );
    }
    if (audios.length > caps.maxAudios) {
        throw new HttpError(
            `${caps.title} supports at most ${caps.maxAudios} reference audios.`,
            400,
        );
    }
    if (audios.length > 0 && images.length === 0 && videos.length === 0) {
        throw new HttpError(
            `${caps.title} reference audios require at least one reference image or reference video.`,
            400,
        );
    }
    return { images, videos, audios };
}
