import { DurableObject } from "cloudflare:workers";
import { Container, getContainer } from "@cloudflare/containers";
import { catalogOutbound, createGateway } from "./gateway.js";
import { FloretCatalogCore } from "./model-catalog.js";

export { ContainerProxy } from "@cloudflare/containers";

export class FloretContainer extends Container {
    defaultPort = 8000;
    // Open SSE streams do not renew activity; keep long creative runs alive.
    sleepAfter = "2h";
    envVars = {
        POLLI_CATALOG_ENDPOINT: "http://floret-catalog.internal/snapshot",
        POLLI_ALLOW_OPERATOR_KEY: "false",
        OPENAI_API_KEY: "",
    };
}
FloretContainer.outboundByHost = {
    "floret-catalog.internal": catalogOutbound,
};

export class FloretCatalog extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);
        this.core = new FloretCatalogCore(ctx, env);
    }
    snapshot() {
        return this.core.snapshot();
    }
    refresh() {
        return this.core.refresh();
    }
    review(apiKey) {
        return this.core.review(apiKey);
    }
    alarm() {
        return this.core.alarm();
    }
}

export default {
    fetch: createGateway((env) => getContainer(env.FLORET, "floret")),
};
