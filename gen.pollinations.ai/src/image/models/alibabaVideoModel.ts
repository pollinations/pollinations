import { UpstreamError } from "@shared/error.ts";
import type { VideoGenerationResult } from "../createAndReturnVideos.ts";
import type { ImageParams } from "../params.ts";
import {
    callAlibabaMedia,
    requireAlibabaUsage,
} from "../utils/alibabaClient.ts";
import { closestRatioLogSpace } from "../utils/aspectRatio.ts";
import { fetchUpstream } from "../utils/fetchUpstream.ts";

export async function callAlibabaVideo(
    prompt: string,
    params: ImageParams,
    version: "2.6" | "3.0",
): Promise<VideoGenerationResult> {
    const requestedDuration = params.duration ?? 5;
    const duration =
        version === "2.6"
            ? [5, 10, 15].reduce((best, value) =>
                  Math.abs(value - requestedDuration) <
                  Math.abs(best - requestedDuration)
                      ? value
                      : best,
              )
            : requestedDuration;
    if (!(version === "3.0" ? [5] : [5, 10, 15]).includes(duration)) {
        throw UpstreamError.fromProvider(400, {
            message: `Unsupported Wan ${version} duration: ${duration}`,
        });
    }
    const frames = params.image ?? [];
    const references = [
        ...(params.reference_images ?? []).map((url) => ({
            type: "reference_image",
            url,
        })),
        ...(params.reference_videos ?? []).map((url) => ({
            type: "reference_video",
            url,
        })),
        ...(params.reference_audios ?? []).map((url) => ({
            type: "reference_audio",
            url,
        })),
    ];
    if (frames.length && references.length) {
        throw UpstreamError.fromProvider(400, {
            message: "Frame inputs and reference media cannot be combined.",
        });
    }
    const ratio =
        version === "2.6" && ["16:9", "9:16"].includes(params.aspectRatio ?? "")
            ? params.aspectRatio
            : closestRatioLogSpace(
                  params.width,
                  params.height,
                  version === "3.0"
                      ? ["16:9", "4:3", "1:1", "3:4", "9:16"]
                      : ["16:9", "9:16"],
              );
    const body =
        version === "3.0"
            ? {
                  model: "wan3.0-video",
                  input: {
                      prompt,
                      media: frames.length
                          ? frames.map((url, i) => ({
                                type: i === 0 ? "first_frame" : "last_frame",
                                url,
                            }))
                          : references,
                  },
                  parameters: {
                      resolution: (params.resolution ?? "480p").toUpperCase(),
                      ratio: frames.length ? "adaptive" : ratio,
                      duration,
                      audio: params.audio,
                      seed: params.seed,
                      prompt_extend: true,
                      watermark: false,
                  },
              }
            : {
                  model: frames.length ? "wan2.6-i2v" : "wan2.6-t2v",
                  input: {
                      prompt,
                      ...(frames.length ? { img_url: frames[0] } : {}),
                  },
                  parameters: {
                      ...(frames.length
                          ? { resolution: "720P" }
                          : {
                                size:
                                    ratio === "9:16" ? "720*1280" : "1280*720",
                            }),
                      duration,
                      seed: params.seed,
                      prompt_extend: true,
                      watermark: false,
                  },
              };
    const result = await callAlibabaMedia(
        "/services/aigc/video-generation/video-synthesis",
        body,
        true,
    );
    const url = result.output?.video_url;
    if (!url)
        throw UpstreamError.fromProvider(502, {
            message: "Alibaba returned no video",
        });
    const outputSeconds = requireAlibabaUsage(
        result.usage?.output_video_duration,
        "output video duration",
    );
    const inputSeconds = requireAlibabaUsage(
        result.usage?.input_video_duration,
        "input video duration",
        true,
    );
    const video = await fetchUpstream(url, {
        errorLabel: "Failed to download Alibaba video",
    });
    return {
        buffer: Buffer.from(await video.arrayBuffer()),
        mimeType: video.headers.get("content-type") || "video/mp4",
        durationSeconds: outputSeconds,
        trackingData: {
            actualModel: params.model,
            usage: {
                completionVideoSeconds: outputSeconds,
                ...(inputSeconds > 0
                    ? { promptVideoSeconds: inputSeconds }
                    : {}),
            },
        },
    };
}
