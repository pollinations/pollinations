import { ensureUpstreamOk } from "@shared/error.ts";
import {
    calculateUsageBilling,
    type ModelDefinition,
    type Usage,
} from "@shared/registry/registry.ts";
import { buildUsageHeaders } from "@shared/registry/usage-headers.ts";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { Env } from "@/env.ts";
import type { MediaTransformRequest } from "@/schemas/media-transform.ts";
import { checkBalance } from "@/utils/generation-access.ts";
import { validateUserMediaUrl } from "@/utils/user-media-url.ts";

export const MEDIA_TRANSFORM_MODEL = "media-transform";
const MAX_SOURCE_BYTES = 100 * 1024 * 1024;

const MEDIA_TRANSFORM_DEFINITION: ModelDefinition = {
    aliases: [],
    provider: "cloudflare",
    brand: "Cloudflare",
    category: "video",
    cost: {
        completionVideoSeconds: 0.0005,
        completionAudioSeconds: 0.0005,
        completionImageTokens: 0.0005,
    },
    priceMultiplier: 1,
    addedDate: Date.UTC(2026, 7, 17),
    title: "Media Transform",
    description: "Trim, resize, extract audio, or capture a video frame",
    inputModalities: ["video"],
    outputModalities: ["video", "audio", "image"],
    supportedEndpoints: ["/v1/media/transforms"],
};

export const resolveMediaTransform = createMiddleware<Env>(async (c, next) => {
    c.set("model", {
        requested: MEDIA_TRANSFORM_MODEL,
        resolved: MEDIA_TRANSFORM_MODEL,
        definition: MEDIA_TRANSFORM_DEFINITION,
    });
    await next();
});

export const mediaTransformAccess = createMiddleware<Env>(async (c, next) => {
    c.var.auth.requireUser();
    const input = c.req.valid("json" as never) as MediaTransformRequest;
    const exactPrice = calculateUsageBilling({
        model: MEDIA_TRANSFORM_MODEL,
        usage: usageForTransform(input),
        servedBy: MEDIA_TRANSFORM_DEFINITION,
    }).price.totalPrice;
    await checkBalance(c.var, c.env, exactPrice);
    await next();
});

function usageForTransform(input: MediaTransformRequest): Usage {
    if (input.mode === "video") {
        return { completionVideoSeconds: input.duration };
    }
    if (input.mode === "audio") {
        return { completionAudioSeconds: input.duration };
    }
    return { completionImageTokens: 1 };
}

export async function transformMedia(c: Context<Env>) {
    const input = c.req.valid("json" as never) as MediaTransformRequest;
    const validatedSource = validateUserMediaUrl(input.source);
    if (!validatedSource.ok) {
        throw new HTTPException(400, {
            message: "source must be a public HTTP(S) URL",
        });
    }
    if (!c.env.MEDIA) {
        throw new HTTPException(503, {
            message: "Media transformations are unavailable",
        });
    }

    const sourceResponse = await fetch(validatedSource.url, {
        redirect: "manual",
    });
    if (sourceResponse.status >= 300 && sourceResponse.status < 400) {
        throw new HTTPException(400, {
            message: "source redirects are not supported",
        });
    }
    await ensureUpstreamOk(sourceResponse, validatedSource.url);
    const contentLength = Number(sourceResponse.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_SOURCE_BYTES) {
        throw new HTTPException(413, {
            message: "source media must be smaller than 100 MB",
        });
    }
    if (!sourceResponse.body) {
        throw new HTTPException(400, {
            message: "source returned no media",
        });
    }

    const resize = {
        ...(input.width !== undefined && { width: input.width }),
        ...(input.height !== undefined && { height: input.height }),
        ...(input.fit !== undefined && { fit: input.fit }),
    };
    const transformer = c.env.MEDIA.input(sourceResponse.body);
    const generator =
        Object.keys(resize).length > 0
            ? transformer.transform(resize)
            : transformer;
    const output = await generator
        .output({
            mode: input.mode,
            time: `${input.time}s`,
            ...(input.duration !== undefined && {
                duration: `${input.duration}s`,
            }),
            ...(input.audio !== undefined && { audio: input.audio }),
            ...(input.format !== undefined && { format: input.format }),
        })
        .response();

    const headers = new Headers(output.headers);
    const contentType = headers.get("content-type") || "";
    const expectedContentType = {
        video: "video/",
        audio: "audio/",
        frame: "image/",
    }[input.mode];
    if (output.ok && !contentType.startsWith(expectedContentType)) {
        throw new HTTPException(502, {
            message: `Media transformation returned ${contentType || "an unknown content type"}`,
        });
    }
    for (const [name, value] of Object.entries(
        output.ok
            ? buildUsageHeaders(MEDIA_TRANSFORM_MODEL, usageForTransform(input))
            : {},
    )) {
        headers.set(name, value);
    }
    return new Response(output.body, {
        status: output.status,
        statusText: output.statusText,
        headers,
    });
}
