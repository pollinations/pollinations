import { Container, getContainer } from "@cloudflare/containers";
import { handleAtEdge } from "./edge.js";

export class BrickContainer extends Container {
    defaultPort = 8000;
    sleepAfter = "15m";
}

export default {
    async fetch(request, env) {
        const edgeResponse = await handleAtEdge(request);
        if (edgeResponse) return edgeResponse;
        return getContainer(env.BRICK, "brick").fetch(request);
    },
};
