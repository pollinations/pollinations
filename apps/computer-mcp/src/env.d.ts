import type { MediaService } from "./assets.ts";

declare global {
    namespace Cloudflare {
        interface Env {
            MEDIA: MediaService;
        }
    }
}
