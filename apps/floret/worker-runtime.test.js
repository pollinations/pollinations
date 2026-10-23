import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

// Keep the real Containers SDK and Worker modules; replace only platform bases.
const platform = `export class DurableObject {
    constructor(ctx, env) { this.ctx = ctx; this.env = env; }
}
export class WorkerEntrypoint extends DurableObject {}`;
const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === "cloudflare:workers") {
            return {
                url: `data:text/javascript,${encodeURIComponent(platform)}`,
                shortCircuit: true,
            };
        }
        if (
            context.parentURL?.includes("/@cloudflare/containers/") &&
            specifier.startsWith(".") &&
            !specifier.endsWith(".js")
        ) {
            return nextResolve(`${specifier}.js`, context);
        }
        return nextResolve(specifier, context);
    },
});
const { ContainerProxy, FloretContainer } = await import("./worker.js");
hooks.deregister();

test("installed SDK dispatches private catalog requests to the Worker binding", async () => {
    let snapshots = 0;
    const proxy = new ContainerProxy(
        {
            props: {
                className: FloretContainer.name,
                containerId: "test-container",
                enableInternet: false,
                interceptAll: false,
            },
        },
        {
            FLORET_CATALOG: {
                getByName(name) {
                    assert.equal(name, "global");
                    return {
                        async snapshot() {
                            snapshots++;
                            return {
                                version: "1",
                                catalog: [{ name: "test" }],
                            };
                        },
                    };
                },
            },
        },
    );
    const response = await proxy.fetch(
        new Request("http://floret-catalog.internal/snapshot"),
    );
    assert.equal(response.status, 200);
    assert.equal(snapshots, 1);
    assert.equal((await response.json()).version, "1");
});
