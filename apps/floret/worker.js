import { DurableObject } from "cloudflare:workers";
import { createSandboxAgent } from "./e2b-agent.js";
import { createGateway } from "./gateway.js";
import { FloretCatalogCore } from "./model-catalog.js";

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
    fetch: createGateway(createSandboxAgent),
};
