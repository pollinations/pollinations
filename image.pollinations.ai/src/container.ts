import { Container, getContainer } from "@cloudflare/containers";
import { env } from "cloudflare:workers";

const { CONTAINER, ...containerEnv } = env;

export class ImageServiceContainer extends Container {
    defaultPort = 16384;
    sleepAfter = "10m";
    envVars = containerEnv;
}

export default {
    async fetch(request: Request, env: CloudflareBindings) {
        const containerInstance = getContainer(env.CONTAINER);
        return containerInstance.fetch(request);
    },
};
