import { z } from "zod";

export const MediaTransformRequestSchema = z
    .object({
        source: z.string().describe("Public HTTP(S) URL of the source media"),
        mode: z.enum(["video", "audio", "frame"]),
        time: z.number().min(0).max(600).default(0),
        duration: z.number().min(1).max(60).optional(),
        width: z.number().int().min(10).max(2000).optional(),
        height: z.number().int().min(10).max(2000).optional(),
        fit: z.enum(["contain", "cover", "scale-down"]).optional(),
        audio: z.boolean().optional(),
        format: z.enum(["jpg", "png"]).optional(),
    })
    .superRefine((input, ctx) => {
        if (input.mode !== "frame" && input.duration === undefined) {
            ctx.addIssue({
                code: "custom",
                path: ["duration"],
                message: "duration is required for video and audio output",
            });
        }
        if (input.mode === "frame" && input.duration !== undefined) {
            ctx.addIssue({
                code: "custom",
                path: ["duration"],
                message: "duration is not supported for frame output",
            });
        }
        if (input.duration !== undefined && input.time + input.duration > 600) {
            ctx.addIssue({
                code: "custom",
                path: ["duration"],
                message: "time plus duration must not exceed 600 seconds",
            });
        }
        if (input.audio !== undefined && input.mode !== "video") {
            ctx.addIssue({
                code: "custom",
                path: ["audio"],
                message: "audio is supported only for video output",
            });
        }
        if (input.format !== undefined && input.mode !== "frame") {
            ctx.addIssue({
                code: "custom",
                path: ["format"],
                message: "format is supported only for frame output",
            });
        }
    })
    .meta({ $id: "MediaTransformRequest" });

export type MediaTransformRequest = z.infer<typeof MediaTransformRequestSchema>;
