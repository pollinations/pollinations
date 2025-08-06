import type { ImageCacheEvent } from "./middleware/analytics.ts";

export type Env = {
    Bindings: Cloudflare.Env;
    Variables: {
        connectingIp: string;
        cacheKey: string;
        analyticsEvents: ImageCacheEvent[];
    };
};
