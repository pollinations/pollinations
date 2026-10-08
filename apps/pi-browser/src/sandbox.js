// Boots Pi in a WASIX sandbox and answers its model requests. Used by the
// page with the browser SDK and by test/sandbox.mjs with the Node SDK.

import {
    bridgeRequest,
    EXTENSION,
    HOME,
    MAILBOX,
    PI_PACKAGE,
    PROJECT,
    PROVIDER_FILE,
} from "./core.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function bootPi(wasmer, { extension, onProgress }) {
    const pkg = await wasmer.packages.load(PI_PACKAGE, { onProgress });
    const sandbox = await wasmer.sandboxes.create({
        packages: [pkg],
        // No guest networking: model calls go through the mailbox below.
        network: { mode: "disabled" },
        env: { HOME, PI_OFFLINE: "1", PI_TELEMETRY: "0" },
    });
    await sandbox.fs.mkdir(MAILBOX, { recursive: true });
    await sandbox.fs.mkdir(PROJECT, { recursive: true });
    await sandbox.fs.writeText(EXTENSION, extension);
    return sandbox;
}

export const writeProvider = (sandbox, config) =>
    sandbox.fs.writeText(PROVIDER_FILE, JSON.stringify(config));

// Polls the mailbox until `signal` aborts. `getKey` is read per request, so
// reconnecting with a new key needs no restart.
export async function serveBridge(
    sandbox,
    { getKey, fetch, signal, onRequest },
) {
    const active = new Map();
    while (!signal.aborted) {
        for (const { name } of await sandbox.fs.readDir(MAILBOX)) {
            if (!name.endsWith(".req") || active.has(name)) continue;
            const base = `${MAILBOX}/${name.slice(0, -4)}`;
            const done = relay(sandbox, base, {
                getKey,
                fetch,
                signal,
                onRequest,
            });
            active.set(
                name,
                done.finally(() => active.delete(name)),
            );
        }
        await sleep(40);
    }
    // Pi has exited: finish in-flight replies, then empty the mailbox so a
    // stopped run's request is never replayed (and billed) by the next run.
    await Promise.allSettled(active.values());
    for (const { name } of await sandbox.fs.readDir(MAILBOX))
        await sandbox.fs.remove(`${MAILBOX}/${name}`);
}

async function relay(sandbox, base, { getKey, fetch, signal, onRequest }) {
    const put = async (suffix, data) => {
        await sandbox.fs.writeFile(`${base}.tmp`, data);
        await sandbox.fs.rename(`${base}.tmp`, `${base}.${suffix}`);
    };
    let chunks = 0;
    let headSent = false;
    let error = "";
    try {
        const request = JSON.parse(await sandbox.fs.readText(`${base}.req`));
        await sandbox.fs.remove(`${base}.req`);
        onRequest?.(request);
        const init = bridgeRequest(request, getKey());
        const response = await fetch(request.url, { ...init, signal });
        await put(
            "head",
            JSON.stringify({
                status: response.status,
                contentType: response.headers.get("content-type"),
            }),
        );
        headSent = true;
        const reader = response.body.getReader();
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            await put(String(chunks++), value);
        }
    } catch (failure) {
        error = failure?.message ?? String(failure);
        // Before any response, report the failure as a 502 that Pi can show.
        if (!headSent) {
            await put(
                "head",
                JSON.stringify({
                    status: 502,
                    contentType: "application/json",
                }),
            );
            await put(
                String(chunks++),
                JSON.stringify({ error: { message: error } }),
            );
            error = "";
        }
    }
    await put("end", JSON.stringify({ chunks, error }));
}
