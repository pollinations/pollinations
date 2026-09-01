import { Container, getContainer } from "@cloudflare/containers";
import { handleRequest } from "./request.js";

export class OptillmContainer extends Container {
    defaultPort = 8000;
    sleepAfter = "10m";

    constructor(ctx, env) {
        super(ctx, env);
        this.envVars = { OPTILLM_BASE_URL: env.GEN_BASE_URL };
    }
}

export default {
    fetch(request, env) {
        return handleRequest(request, env, getContainer);
    },
};
