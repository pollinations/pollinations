import { Container, getContainer } from "@cloudflare/containers";
import { env } from "cloudflare:workers";

const { CONTAINER, ...containerEnv } = env;

export class ImageServiceContainer extends Container {
    defaultPort = 16384;
    sleepAfter = "10m";
    envVars = containerEnv;

    override onStart(): void {
        console.log("Container started!");
    }

    override onStop(): void {
        console.log("Container stopped!");
    }

    override onError(error: unknown): any {
        console.error("Container error:", error);
        throw error;
    }
}

export default {
    async fetch(request: Request, env: CloudflareBindings) {
        const container = getContainer(env.CONTAINER);
        return container.fetch(request);
    },
};
