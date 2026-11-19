import type { ModelInfo } from "@pollinations/sdk";

export const imageMime = {
    gif: "image/gif",
    svg: "image/svg+xml",
    png: "image/png",
    webp: "image/webp",
    jpeg: "image/jpeg",
} as const;
type Format = keyof typeof imageMime;
const formats = Object.keys(imageMime) as Format[];
const requestFormats = ["gif", "png", "webp"] as const;

// Native outputs use the ordinary image request. The SDK can explicitly
// request GIF, PNG and WebP when the model advertises them.
export function imageOutput(
    formatsByName: ModelInfo["output_formats"],
    selected?: string,
) {
    const native = formats.find(
        (key) => formatsByName?.[key]?.mode === "native",
    );
    const choices = requestFormats.filter(
        (key) => formatsByName?.[key]?.mode === "selectable",
    );
    const selectedFormat = native
        ? undefined
        : choices.find((key) => key === selected);
    const format = native ?? selectedFormat;
    const info = format ? formatsByName?.[format] : undefined;
    const request = selectedFormat
        ? {
              outputFormat: selectedFormat,
              ...(selectedFormat === "gif" && {
                  frameCount: info?.frame_defaults?.frame_count,
                  frameDurationMs: info?.frame_defaults?.frame_duration_ms,
              }),
          }
        : undefined;
    return {
        format,
        info,
        options: native
            ? [native]
            : choices.length
              ? ["still", ...choices]
              : [],
        request,
    };
}
