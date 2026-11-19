import type { ModelInfo } from "@pollinations/sdk";

type FormatInfo = NonNullable<ModelInfo["output_formats"]>[string];
export type ImageFormats = Record<
    string,
    Omit<FormatInfo, "mode"> & { mode: FormatInfo["mode"] | "default" }
>;

// Overlay catalog entries last so published metadata always wins.
export function previewImageFormats(
    model: ModelInfo,
    preview?: Record<string, string>,
): ImageFormats | undefined {
    if (!preview) return model.output_formats;
    const formats: ImageFormats = {};
    for (const [key, mode] of Object.entries(preview)) {
        if (mode === "default" || mode === "selectable")
            formats[key] = {
                mode,
                input_modalities: model.input_modalities ?? [],
            };
    }
    return { ...formats, ...model.output_formats };
}

export function imageFormatLabel(value: string) {
    if (value === "webp") return "WebP";
    if (value === "still") return "Model default";
    return value.toUpperCase();
}

export const imageMime = {
    gif: "image/gif",
    svg: "image/svg+xml",
    png: "image/png",
    webp: "image/webp",
    jpeg: "image/jpeg",
} as const;
type Format = keyof typeof imageMime;
const formats = Object.keys(imageMime) as Format[];
const requestFormats = ["png", "webp", "gif"] as const;

// Native outputs use the ordinary image request. The SDK can explicitly
// request GIF, PNG and WebP when the model advertises them.
export function imageOutput(
    formatsByName: ImageFormats | undefined,
    selected?: string,
) {
    const native = formats.find(
        (key) => formatsByName?.[key]?.mode === "native",
    );
    const defaultFormat = formats.find(
        (key) => formatsByName?.[key]?.mode === "default",
    );
    const choices = requestFormats.filter(
        (key) => formatsByName?.[key]?.mode === "selectable",
    );
    const selectedFormat = native
        ? undefined
        : choices.find((key) => key === selected);
    const format = native ?? selectedFormat ?? defaultFormat;
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
            : defaultFormat
              ? [defaultFormat, ...choices]
              : choices.length
                ? ["still", ...choices]
                : [],
        request,
    };
}
