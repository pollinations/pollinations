import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const image = process.argv[2];
assert(image, "Provide the built Flow image name");
const names = ["first", "second"].map(
    (name) => `flow-proof-${process.pid}-${name}`,
);
const docker = async (...args) =>
    (await exec("docker", args, { maxBuffer: 4 * 1024 * 1024 })).stdout.trim();
const start = (name) =>
    docker("run", "--detach", "--init", "--name", name, "--memory=3g", image);
async function request(name, path, body) {
    // Return only status and wallet total; never print session cookies or keys.
    return JSON.parse(
        await docker(
            "exec",
            name,
            "node",
            "--input-type=module",
            "-e",
            `
        const response = await fetch(${JSON.stringify(`http://localhost:4180${path}`)}, {
            method: ${JSON.stringify(body === undefined ? "GET" : "POST")},
            headers: { "Content-Type": "application/json" },
            body: ${body === undefined ? "undefined" : JSON.stringify(JSON.stringify(body))}
        });
        const data = await response.json();
        console.log(JSON.stringify({ status: response.status, total: data.wallet?.total }));
    `,
        ),
    );
}
async function smoke(name, initialState = "fresh") {
    console.log(
        await docker(
            "exec",
            name,
            "node",
            "operations/flow/test/packaged-smoke.mjs",
            initialState,
        ),
    );
}
const [first, second] = names;
try {
    for (const name of names) await start(name);
    for (const name of names) await smoke(name);
    assert.equal(
        (await request(first, "/__flow/conditions", { pollen: "empty" }))
            .status,
        200,
    );
    assert.equal(
        (await request(second, "/__flow/conditions", { pollen: "quest" }))
            .status,
        200,
    );
    assert.equal(
        (
            await request(second, "/__flow/review/requests", [
                { path: "/api/app-lookup", outcome: "unavailable" },
            ])
        ).status,
        200,
    );
    assert.equal((await request(first, "/__flow/state")).total, 0);
    assert.equal((await request(second, "/__flow/state")).total, 5);
    assert.equal((await request(first, "/__flow/reset", {})).total, 10);
    assert.equal((await request(second, "/__flow/state")).total, 5);
    const lookup =
        "/api/app-lookup?client_id=pk_flow_local_example_not_a_real_credential";
    assert.equal((await request(first, lookup)).status, 200);
    assert.equal((await request(second, lookup)).status, 503);
    console.log("Two containers isolate wallets, faults and resets.");
    console.log(
        await docker(
            "stats",
            "--no-stream",
            "--format",
            "{{.Name}} {{.MemUsage}}",
            ...names,
        ),
    );

    // A process restart keeps this container's local data. A replacement gets
    // a new filesystem, matching the disposable hosted-container boundary.
    assert.equal(
        (await request(first, "/__flow/conditions", { pollen: "empty" }))
            .status,
        200,
    );
    await docker("restart", first);
    await smoke(first, "empty");
    assert.equal((await request(second, "/__flow/state")).total, 5);
    assert.equal((await request(second, lookup)).status, 503);
    await docker("rm", "--force", first);
    await start(first);
    // smoke waits for startup and initializes only the replacement container.
    await smoke(first);
    assert.equal((await request(first, "/__flow/state")).total, 10);
    assert.equal((await request(second, "/__flow/state")).total, 5);
    assert.equal((await request(second, lookup)).status, 503);
    console.log("Restart and replacement leave the other review intact.");
} catch (error) {
    for (const name of names) {
        const logs = await exec("docker", ["logs", "--tail", "80", name]).catch(
            () => ({ stdout: "", stderr: "" }),
        );
        console.error(logs.stdout, logs.stderr);
    }
    throw error;
} finally {
    const cleanup = await Promise.allSettled(
        names.map((name) => docker("rm", "--force", name)),
    );
    for (const result of cleanup) {
        if (result.status === "rejected") {
            console.error("Container cleanup failed:", result.reason);
            process.exitCode = 1;
        }
    }
}
