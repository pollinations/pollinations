import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

export type ImageParams = {
    model: string;
    width: number;
    height: number;
    seed: number;
    negativePrompt: string;
    enhance: boolean;
    nologo: boolean;
    quality: string;
    safe: boolean;
    nofeed: boolean;
    image?: string;
};

type Env = {
    Bindings: Cloudflare.Env;
    Variables: {
        imageParams: ImageParams;
    };
};

export const parseImageParams = createMiddleware<Env>(async (c, next) => {
    const url = new URL(c.req.url);
    
    const imageParams: ImageParams = {
        model: url.searchParams.get("model") || "flux",
        width: parseInt(url.searchParams.get("width") || "") || 1024,
        height: parseInt(url.searchParams.get("height") || "") || 1024,
        seed: parseInt(url.searchParams.get("seed") || "") || 42,
        negativePrompt: url.searchParams.get("negative_prompt") || "worst quality, blurry",
        enhance: url.searchParams.get("enhance") === "true",
        nologo: url.searchParams.get("nologo") === "true",
        quality: url.searchParams.get("quality") || "medium",
        safe: url.searchParams.get("safe") === "true",
        nofeed: url.searchParams.get("nofeed") === "true",
        image: url.searchParams.get("image") || undefined,
    };
    
    c.set("imageParams", imageParams);
    await next();
});
