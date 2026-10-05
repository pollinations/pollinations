// Runs inside the Pollinations VM. No deployment, purchases or key creation.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import agent from "./agent.json" with { type: "json" };

const root = resolve(import.meta.dirname, "../..");
const token = process.env.POLLINATIONS_API_KEY_AGENT_MODEL_MANAGER;
assert.ok(token, "Existing authorized runtime key required");
const children = [];
const output = join(root, "operations/model-manager/data");
await mkdir(output, { recursive: true, mode: 0o700 });
function command(args, cwd = root, env = {}) {
    execFileSync(args[0], args.slice(1), {
        cwd,
        env: {
            ...process.env,
            NODE_OPTIONS: "--max-old-space-size=1200",
            ...env,
        },
        stdio: "pipe",
        maxBuffer: 32 * 1024 * 1024,
    });
}
function start(args, cwd) {
    const child = spawn(args[0], args.slice(1), {
        cwd,
        env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
    });
    child.log = "";
    for (const stream of [child.stdout, child.stderr])
        stream.on("data", (data) => {
            child.log = (child.log + String(data)).slice(-12000);
        });
    children.push(child);
    return child;
}
async function ready(url) {
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
        try {
            if ((await fetch(url, { signal: AbortSignal.timeout(10000) })).ok)
                return;
        } catch {}
        if (children.some((child) => child.exitCode !== null))
            throw new Error(
                `Local worker exited before readiness: ${children.map((child) => child.log).join("\n")}`,
            );
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("Local worker readiness timed out");
}
async function json(url, body) {
    const response = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
            ...(body && { "content-type": "application/json" }),
        },
        ...(body && { method: "POST", body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(120000),
    });
    if (!response.ok)
        throw new Error(
            `Local API HTTP ${response.status}: ${(await response.text()).slice(0, 2000)}`,
        );
    return { response, body: await response.json() };
}
try {
    console.log("Installing checkout dependencies");
    command(["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"]);
    command(["npm", "run", "build:ui"], join(root, "enter.pollinations.ai"));
    console.log("Building Enter and Gen");
    command(
        ["npx", "vite", "build", "--mode=development"],
        join(root, "enter.pollinations.ai"),
    );
    command(
        ["npx", "vite", "build", "--mode=development"],
        join(root, "gen.pollinations.ai"),
    );
    // Both workers use the same isolated local D1/KV/R2 directory.
    const persist = join(root, "operations/model-manager/data/local-state");
    command(
        [
            "npx",
            "wrangler",
            "d1",
            "migrations",
            "apply",
            "DB",
            "--local",
            "--persist-to",
            persist,
        ],
        join(root, "gen.pollinations.ai"),
    );
    const dbDir = join(persist, "v3/d1/miniflare-D1DatabaseObject");
    const databases = (await readdir(dbDir)).filter((name) =>
        name.endsWith(".sqlite"),
    );
    assert.equal(databases.length, 1, "Expected one isolated D1 database");
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(join(dbDir, databases[0]));
    const { defaultKeyHasher } = await import(
        createRequire(join(root, "enter.pollinations.ai/package.json")).resolve(
            "@better-auth/api-key",
        )
    );
    // Seed the existing credential's hash in disposable test state; no new key.
    db.prepare(
        "INSERT INTO user (id,name,email,email_verified,tier_balance,pack_balance,github_username,created_at,updated_at,auto_top_up_enabled) VALUES (?,?,?,1,10,10,?,strftime('%s','now'),strftime('%s','now'),0)",
    ).run(
        "model-manager-e2e",
        "Model manager E2E",
        "local-e2e@test.local",
        "model-manager-e2e",
    );
    db.prepare(
        "INSERT INTO apikey (id,name,prefix,key,user_id,permissions,enabled,rate_limit_enabled,request_count,created_at,updated_at) VALUES (?,?,?,?,?,?,1,0,0,strftime('%s','now'),strftime('%s','now'))",
    ).run(
        "model-manager-e2e-key",
        "local-test",
        "sk",
        await defaultKeyHasher(token),
        "model-manager-e2e",
        JSON.stringify({ account: ["profile", "usage", "keys"] }),
    );
    db.close();
    const wrangler = join(root, "node_modules/.bin/wrangler");
    start(
        [
            wrangler,
            "dev",
            "--config",
            "dist/pollinations_enter/wrangler.json",
            "--local",
            "--port",
            "3000",
            "--inspector-port",
            "9230",
            "--persist-to",
            persist,
            "--show-interactive-dev-session",
            "false",
        ],
        join(root, "enter.pollinations.ai"),
    );
    await ready("http://127.0.0.1:3000/");
    console.log("Checking Enter authentication");
    const profile = await json("http://127.0.0.1:3000/api/account/profile");
    assert.equal(profile.body.email, "local-e2e@test.local");
    console.log("Registering the local private prompt agent");
    const registered = await json(
        "http://127.0.0.1:3000/api/account/agents",
        agent,
    );
    assert.equal(registered.body.type, "prompt_agent");
    assert.equal(registered.body.visibility, "private");
    const model = `community/model-manager-e2e/${agent.name}`;
    start(
        [
            wrangler,
            "dev",
            "--local",
            "--port",
            "8788",
            "--inspector-port",
            "9231",
            "--persist-to",
            persist,
            "--show-interactive-dev-session",
            "false",
        ],
        join(root, "gen.pollinations.ai"),
    );
    await ready("http://127.0.0.1:8788/models");
    console.log("Checking the Gen account proxy");
    const before = (await json("http://127.0.0.1:8788/account/balance")).body
        .balance;
    const input = JSON.stringify({
        at: new Date().toISOString(),
        findings: [
            {
                id: "lab/sandbox-verification",
                kind: "investigate",
                reasons: [
                    "Test lead with no provider evidence; explicitly mark verification missing.",
                ],
            },
        ],
        inventory: [],
        gaps: [],
    });
    const request = {
        model,
        input,
        max_output_tokens: 1200,
        reasoning: { effort: "none" },
        stream: false,
        store: false,
    };
    console.log("Running private prompt-agent inference");
    const first = await json("http://127.0.0.1:8788/v1/responses", request);
    assert.equal(first.body.status, "completed");
    assert.ok(
        first.body.usage?.total_tokens > 0,
        "Real provider usage required",
    );
    assert.ok(
        first.body.output?.some((item) =>
            item.content?.some(
                (part) => part.type === "output_text" && part.text,
            ),
        ),
    );
    const price = Number(first.response.headers.get("x-usage-price"));
    assert.ok(
        Number.isFinite(price) && price >= 0 && price < 0.1,
        "Finite bounded parent price required",
    );
    const after = (await json("http://127.0.0.1:8788/account/balance")).body
        .balance;
    assert.ok(
        before > after && before - after < 0.1,
        "Real child inference must debit the wallet",
    );
    const repeat = await json("http://127.0.0.1:8788/v1/responses", request);
    assert.deepEqual(
        repeat.body.output,
        first.body.output,
        "Identical request must retrieve completed cache",
    );
    const repeatedBalance = (
        await json("http://127.0.0.1:8788/account/balance")
    ).body.balance;
    assert.equal(
        repeatedBalance,
        after,
        "Cache hit must not debit the wallet again",
    );
    const id = first.response.headers.get("x-request-id");
    assert.ok(id);
    // Prompt agents also emit a zero-price parent event. Count charges, while
    // reconciling the price of every final billed event against the wallet.
    const query = `SELECT countIf(total_price > 0) AS count, sum(total_price) AS price FROM generation_event_v2 WHERE (request_id = '${id.replaceAll("'", "''")}' OR parent_request_id = '${id.replaceAll("'", "''")}') AND is_billed_usage = true AND is_final = true FORMAT JSON`;
    let rows;
    for (let i = 0; i < 15; i++) {
        const response = await fetch(
            `https://api.europe-west2.gcp.tinybird.co/v0/sql?q=${encodeURIComponent(query)}`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.TINYBIRD_READ_TOKEN}`,
                },
                signal: AbortSignal.timeout(15000),
            },
        );
        assert.equal(
            response.status,
            200,
            "Staging billing evidence read required",
        );
        rows = (await response.json()).data;
        if (rows?.[0]?.count === 1) break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert.equal(
        rows?.[0]?.count,
        1,
        "Exactly one charged staging event required",
    );
    assert.ok(
        Math.abs(rows[0].price - (before - after)) < 0.00001,
        "Actual billed child event must match wallet settlement",
    );
    await writeFile(
        join(output, "stack-result.json"),
        JSON.stringify({
            at: new Date().toISOString(),
            model,
            agentType: registered.body.type,
            visibility: registered.body.visibility,
            price,
            usage: first.body.usage,
            requestId: id,
            walletDebit: before - after,
            cacheHitNoDebit: true,
            billedEvents: 1,
            isolatedState: true,
        }),
        { mode: 0o600 },
    );
    console.log(
        "Enter + Gen: private prompt agent, real provider usage, wallet settlement, cache retrieval and staging billing passed",
    );
} catch (error) {
    console.error(error.message);
    for (const child of children) console.error(child.log.slice(-8000));
    if (error.stderr) console.error(String(error.stderr));
    process.exitCode = 1;
} finally {
    for (const child of children) {
        try {
            process.kill(-child.pid, "SIGTERM");
        } catch {}
    }
}
