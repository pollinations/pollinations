import type { MediaService } from "./assets.ts";
import type { Computer } from "./index.ts";

declare global {
    namespace Cloudflare {
        interface Env {
            COMPUTER: DurableObjectNamespace<Computer>;
            MEDIA: MediaService;
        }
    }
}
