import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";

// Execute the production bridge across real workerd Durable Object boundaries.
// A JS stub cannot catch unsupported RPC argument serialization.
test("shell bridge uses supported fetch transport and destroys each invocation", async () => {
    const root = new URL("./", import.meta.url);
    const runtime = new Miniflare({
        workers: [
            {
                name: "shell-rpc-regression",
                compatibilityDate: "2026-01-01",
                modules: [
                    {
                        type: "ESModule",
                        path: fileURLToPath(new URL("rpc-fixture.js", root)),
                        contents: `
                    import { DurableObject } from "cloudflare:workers";
                    import { createShellOutbound } from "./shell-bridge.js";
                    export class Shell extends DurableObject {
                        async startAndWaitForPorts() {
                            throw new Error("Startup belongs inside SDK fetch, never RPC");
                        }
                        async fetch(request) {
                            if (request.headers.has("Authorization")) throw new Error("credential leaked");
                            await this.ctx.storage.put("executed", true);
                            return new Response(await request.arrayBuffer());
                        }
                        async destroy() { await this.ctx.storage.put("destroyed", true); }
                        async status() { return Object.fromEntries(await this.ctx.storage.list()); }
                    }
                    let invocation = 0;
                    const outbound = createShellOutbound({
                        fetchImpl: async () => Response.json({ valid: true }),
                        getContainerImpl: (namespace, name) => namespace.getByName(name),
                        uuidImpl: () => "invocation-" + ++invocation,
                    });
                    export default {
                        fetch(request, env) {
                            if (new URL(request.url).pathname === "/status") {
                                return Promise.all([1, 2].map(n => env.FLORET_SHELL.getByName("invocation-" + n).status()))
                                    .then(states => Response.json(states));
                            }
                            return outbound(request, env);
                        }
                    };
                `,
                    },
                    {
                        type: "ESModule",
                        path: fileURLToPath(new URL("shell-bridge.js", root)),
                        contents: await readFile(
                            new URL("shell-bridge.js", root),
                            "utf8",
                        ),
                    },
                ],
                durableObjects: { FLORET_SHELL: "Shell" },
            },
        ],
    });
    try {
        for (const body of ["first", "second"]) {
            const response = await runtime.dispatchFetch(
                "http://shell.internal/run",
                {
                    method: "POST",
                    headers: {
                        Authorization: "Bearer ag_test",
                        "Content-Length": String(body.length),
                    },
                    body,
                },
            );
            assert.equal(response.status, 200);
            assert.equal(await response.text(), body);
        }
        const status = await runtime.dispatchFetch(
            "http://shell.internal/status",
        );
        assert.deepEqual(await status.json(), [
            { destroyed: true, executed: true },
            { destroyed: true, executed: true },
        ]);
    } finally {
        await runtime.dispose();
    }
});
