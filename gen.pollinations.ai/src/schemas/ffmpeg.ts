import { z } from "zod";

const POLLINATIONS_MEDIA_HOST = "media.pollinations.ai";
const OUTPUT_EXTENSIONS = [
    "mp4",
    "webm",
    "mov",
    "mp3",
    "m4a",
    "wav",
    "flac",
    "ogg",
    "gif",
    "jpg",
    "jpeg",
    "png",
] as const;

export const FfmpegRequestSchema = z
    .object({
        source: z
            .url()
            .refine((value) => {
                const url = new URL(value);
                return (
                    url.protocol === "https:" &&
                    url.hostname === POLLINATIONS_MEDIA_HOST &&
                    !url.username &&
                    !url.password
                );
            }, "source must be an HTTPS media.pollinations.ai URL without credentials")
            .describe("Pollinations media URL to use as the FFmpeg input"),
        args: z
            .array(z.string().min(1).max(1024))
            .max(64)
            .refine(
                (args) => !args.includes("-i"),
                "omit -i; Pollinations supplies the input",
            )
            .describe(
                "FFmpeg arguments after the input and before the output path",
            ),
        outputExtension: z
            .enum(OUTPUT_EXTENSIONS)
            .describe("Single-file output format"),
    })
    .strict()
    .meta({ $id: "FfmpegRequest" });

export type FfmpegRequest = z.infer<typeof FfmpegRequestSchema>;
