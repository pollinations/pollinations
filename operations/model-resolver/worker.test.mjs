import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { brotliCompressSync } from "node:zlib";
import { build } from "esbuild";
import { Miniflare } from "miniflare";

test("Cloudflare decodes and redacts compressed protected test inputs", async () => {
    const vars = {
        enter: { BETTER_AUTH_SECRET: "test-only" },
        gen: { BETTER_AUTH_SECRET: "test-only" },
    };
    const packed = `br:${brotliCompressSync(Buffer.from(JSON.stringify(vars))).toString("base64")}`;
    const bundle = await build({
        stdin: {
            contents: `import {validateTestVars,Workspace} from './sandbox.mjs';
export default {fetch(request,env) {return Response.json({vars:validateTestVars(env.TEST_VARS_JSON),output:new Workspace(env,()=>{}).redact('output test-only')});}};`,
            resolveDir: fileURLToPath(new URL(".", import.meta.url)),
        },
        bundle: true,
        write: false,
        format: "esm",
        platform: "neutral",
        mainFields: ["module", "main"],
        external: ["node:*"],
        logLevel: "silent",
    });
    const runtime = new Miniflare({
        workers: [
            {
                config: {
                    name: "test-input-probe",
                    compatibilityDate: "2026-10-06",
                    compatibilityFlags: ["nodejs_compat"],
                    manifest: {
                        mainModule: "probe.mjs",
                        modules: {
                            "probe.mjs": {
                                type: "esm",
                                contents: bundle.outputFiles[0].text,
                            },
                        },
                    },
                    env: { TEST_VARS_JSON: { type: "text", value: packed } },
                },
            },
        ],
    });
    try {
        assert.deepEqual(
            await (await runtime.dispatchFetch("https://runner/test")).json(),
            {
                vars,
                output: "output [redacted]",
            },
        );
    } finally {
        await runtime.dispose();
    }
});

test("real Cloudflare DO alarm persists a blocked task before any unconfigured paid work", async () => {
    const bundle = await build({
        entryPoints: [fileURLToPath(new URL("./worker.mjs", import.meta.url))],
        bundle: true,
        write: false,
        format: "esm",
        platform: "neutral",
        mainFields: ["module", "main"],
        external: ["node:*"],
        logLevel: "silent",
    });
    const runtime = new Miniflare({
        workers: [
            {
                config: {
                    name: "model-management",
                    compatibilityDate: "2026-10-06",
                    compatibilityFlags: ["nodejs_compat"],
                    manifest: {
                        mainModule: "probe.mjs",
                        modules: {
                            "worker.mjs": {
                                type: "esm",
                                contents: bundle.outputFiles[0].text,
                            },
                            "probe.mjs": {
                                type: "esm",
                                contents: `import {ModelManagementTask} from './worker.mjs';
export {default,ModelManagementTask} from './worker.mjs';
export class SnapshotProbe extends ModelManagementTask {
  async fetch(request) {
    if(request.method==='PUT') await this.tasks.put('task',{id:'large',kind:'issue',phase:'blocked',spent:0.1,turns:3,messages:[{content:'x'.repeat(3*1024*1024)}]});
    const task=await this.tasks.get('task');
    return Response.json({length:task.messages[0].content.length,spent:task.spent,turns:task.turns});
  }
}`,
                            },
                        },
                    },
                    exports: {
                        ModelManagementTask: {
                            type: "durable-object",
                            storage: "sqlite",
                        },
                        SnapshotProbe: {
                            type: "durable-object",
                            storage: "sqlite",
                        },
                    },
                    env: {
                        MODEL_TASKS: {
                            type: "durable-object",
                            worker: "model-management",
                            exportName: "ModelManagementTask",
                        },
                        SNAPSHOT_PROBE: {
                            type: "durable-object",
                            worker: "model-management",
                            exportName: "SnapshotProbe",
                        },
                        RESEARCH_EVIDENCE: {
                            type: "r2",
                            name: "model-management-evidence",
                        },
                        ENABLED: { type: "text", value: "true" },
                    },
                },
            },
        ],
    });
    try {
        assert.equal(
            (await runtime.dispatchFetch("https://runner/health")).status,
            200,
        );
        assert.equal(
            (
                await runtime.dispatchFetch("https://runner/task", {
                    method: "POST",
                })
            ).status,
            404,
        );
        const namespace =
            await runtime.getDurableObjectNamespace("MODEL_TASKS");
        const task = namespace.get(namespace.idFromName("issue:1"));
        const wake = (body) =>
            task.fetch("https://internal/task", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
        assert.equal(
            (await wake({ id: "issue:1", kind: "issue", issue: -1 })).status,
            400,
        );
        const input = { id: "issue:1", kind: "issue", issue: 1 };
        assert.equal((await (await wake(input)).json()).phase, "review");
        let phase;
        for (let i = 0; i < 20; i++) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            phase = (await (await wake(input)).json()).phase;
            if (phase === "blocked") break;
        }
        assert.equal(phase, "blocked");
        assert.equal((await (await wake(input)).json()).phase, "blocked");
        const probes =
            await runtime.getDurableObjectNamespace("SNAPSHOT_PROBE");
        const probe = probes.get(probes.idFromName("large"));
        const expected = { length: 3 * 1024 * 1024, spent: 0.1, turns: 3 };
        assert.deepEqual(
            await (
                await probe.fetch("https://internal/snapshot", {
                    method: "PUT",
                })
            ).json(),
            expected,
        );
        await runtime.unsafeEvictDurableObject(
            "model-management",
            "SnapshotProbe",
            { name: "large" },
        );
        assert.deepEqual(
            await (await probe.fetch("https://internal/snapshot")).json(),
            expected,
        );
    } finally {
        await runtime.dispose();
    }
});
