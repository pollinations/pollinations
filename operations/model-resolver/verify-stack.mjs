import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { CommandExitError, Sandbox } from "e2b";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const BASE = "https://gen.pollinations.ai";
const FIELD = "POLLINATIONS_API_KEY";
const TEMPLATE = "u1yrkaokyjzef8qchho5"; // codex: 2 vCPU, 2 GiB; no automatic key creation.
const REMOTE = "/home/user/pollinations";
const { values } = parseArgs({
    options: {
        out: { type: "string", default: join(HERE, "data") },
        help: { type: "boolean", default: false },
    },
});
if (values.help) {
    console.log(
        "Manual resolver foundation: [--out /absolute/private/path]. Inject an existing Pollinations agent-account key through POLLINATIONS_API_KEY. The host reads existing Enter/Gen dev SOPS credentials. Builds and tests trusted checkout code in a Pollinations VM; no automatic edits, PRs or production registration.",
    );
    process.exit(0);
}
const out = resolve(values.out);
const proof = {
    startedAt: new Date().toISOString(),
    status: "starting",
    stages: [],
};
let sandbox;
let token;
const secretValues = [];
const abort = new AbortController();
process.once("SIGINT", () => abort.abort());
process.once("SIGTERM", () => abort.abort());
const redact = (value) =>
    secretValues.reduce(
        (text, secret) => text.split(secret).join("[REDACTED]"),
        String(value),
    );
async function save(name, value) {
    await writeFile(join(out, name), redact(value), { mode: 0o600 });
}
function secret(file, name) {
    const value =
        process.env[name] ||
        execFileSync(
            "sops",
            ["decrypt", "--extract", `["${name}"]`, resolve(file)],
            {
                encoding: "utf8",
                stdio: ["ignore", "pipe", "pipe"],
            },
        ).trim();
    if (!value) throw new Error(`Missing ${name}`);
    secretValues.push(value);
    return value;
}
async function account(path) {
    const response = await fetch(`${BASE}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Account API HTTP ${response.status}`);
    return response.json();
}

async function command(stage, commandText, options = {}, acceptable = [0]) {
    console.log(`Starting ${stage}`);
    let result;
    try {
        result = await sandbox.commands.run(commandText, {
            cwd: REMOTE,
            timeoutMs: 180_000,
            signal: abort.signal,
            ...options,
        });
    } catch (error) {
        if (!(error instanceof CommandExitError)) throw error;
        result = error;
    }
    proof.stages.push({ stage, exitCode: result.exitCode });
    // Store redacted diagnostics only in private verification evidence, never console logs.
    proof[`${stage}Log`] = redact(`${result.stdout}\n${result.stderr}`).slice(
        -100_000,
    );
    if (!acceptable.includes(result.exitCode))
        throw new Error(`${stage} failed with exit ${result.exitCode}`);
    console.log(`${stage}: exit ${result.exitCode}`);
}

// Dev SOPS includes real Azure provider access; inference can incur provider charges.
// Only the application database and verified Tinybird telemetry are disposable/staging.
async function stackSource() {
    const gen = Object.fromEntries(
        [
            "AZURE_MYCELI_PROD_API_KEY",
            "BETTER_AUTH_SECRET",
            "TINYBIRD_INGEST_TOKEN",
        ].map((name) => [
            name,
            secret(
                join(ROOT, "gen.pollinations.ai/secrets/dev.vars.json"),
                name,
            ),
        ]),
    );
    const enter = {
        BETTER_AUTH_SECRET: secret(
            join(ROOT, "enter.pollinations.ai/secrets/dev.vars.json"),
            "BETTER_AUTH_SECRET",
        ),
    };
    const readToken = secret(
        join(ROOT, "enter.pollinations.ai/secrets/dev.vars.json"),
        "TINYBIRD_READ_TOKEN",
    );
    for (const credential of [gen.TINYBIRD_INGEST_TOKEN, readToken]) {
        const response = await fetch(
            "https://api.europe-west2.gcp.tinybird.co/v1/workspace",
            {
                headers: { Authorization: `Bearer ${credential}` },
                signal: AbortSignal.timeout(15000),
            },
        );
        if (
            !response.ok ||
            (await response.json()).name !== "pollinations_enter_staging"
        )
            throw new Error("Billing test credentials must target staging");
    }
    // Upload tracked working files, including this PR's edits, without secret files.
    const files = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT })
        .toString()
        .split("\0")
        .filter(
            (name) =>
                name &&
                !name.includes("/secrets/") &&
                existsSync(join(ROOT, name)),
        );
    const archive = execFileSync(
        "tar",
        ["-czf", "-", "--no-xattrs", "--null", "-T", "-"],
        {
            cwd: ROOT,
            env: { ...process.env, COPYFILE_DISABLE: "1" },
            input: Buffer.from(`${files.join("\0")}\0`),
            maxBuffer: 128 * 1024 * 1024,
        },
    );
    proof.revision = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: ROOT,
        encoding: "utf8",
    }).trim();
    proof.archiveSha256 = createHash("sha256").update(archive).digest("hex");
    return { archive, gen, enter, readToken };
}

async function validateStack({ archive, gen, enter, readToken }) {
    await sandbox.files.write("/home/user/source.tgz", archive);
    await command(
        "bootstrap",
        "tar -xzf /home/user/source.tgz && curl -fsSLO https://nodejs.org/dist/v24.10.0/node-v24.10.0-linux-x64.tar.xz && curl -fsSL https://nodejs.org/dist/v24.10.0/SHASUMS256.txt | grep ' node-v24.10.0-linux-x64.tar.xz$' | sha256sum -c - && mkdir -p /home/user/mm-node && tar -xJf node-v24.10.0-linux-x64.tar.xz -C /home/user/mm-node --strip-components=1",
    );
    const dotenv = (data) =>
        `${Object.entries(data)
            .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
            .join("\n")}\n`;
    await sandbox.files.write(
        `${REMOTE}/gen.pollinations.ai/.dev.vars`,
        dotenv(gen),
    );
    await sandbox.files.write(
        `${REMOTE}/enter.pollinations.ai/.dev.vars`,
        dotenv(enter),
    );
    await command(
        "enter-gen-e2e",
        "PATH=/home/user/mm-node/bin:/usr/local/bin:/usr/bin:/bin node operations/model-resolver/stack.mjs",
        {
            timeoutMs: 600000,
            envs: { [FIELD]: token, TINYBIRD_READ_TOKEN: readToken },
        },
    );
    proof.results = JSON.parse(
        await sandbox.files.read(
            `${REMOTE}/operations/model-resolver/data/stack-result.json`,
        ),
    );
    proof.status = "complete";
}

try {
    await mkdir(out, { recursive: true, mode: 0o700 });
    token = process.env[FIELD];
    if (!token)
        throw new Error(
            "Existing POLLINATIONS_API_KEY required in the runtime environment",
        );
    secretValues.push(token);
    const profile = await account("/account/profile");
    if (profile.email !== "pollinationsagent@gmail.com")
        throw new Error("Wrong agent account");
    const key = await account("/account/key");
    if (
        !key.permissions?.account?.includes("machines") ||
        key.permissions.account.includes("keys")
    )
        throw new Error(
            "Validation needs machines access without key-management access",
        );
    if (!Number.isFinite(key.pollenBudget) || key.pollenBudget < 0.1)
        throw new Error(
            "Insufficient dedicated-key budget for the 0.1 Pollen compute reservation",
        );
    proof.keyBudgetBefore = key.pollenBudget;
    const existing = await account(
        `/alpha/e2b/v2/sandboxes?metadata=${encodeURIComponent("agent=model-resolver&purpose=stack-validation")}&state=running&limit=100`,
    );
    if (!Array.isArray(existing) || existing.length)
        throw new Error(
            "A resolver validation VM is already active; inspect it before retrying",
        );
    const stack = await stackSource();
    sandbox = await Sandbox.create(TEMPLATE, {
        apiKey: token,
        apiUrl: `${BASE}/alpha/e2b`,
        timeoutMs: 1_200_000,
        requestTimeoutMs: 45_000,
        retries: 0,
        signal: abort.signal,
        lifecycle: { onTimeout: "kill" },
        metadata: { agent: "model-resolver", purpose: "stack-validation" },
    });
    proof.sandboxId = sandbox.sandboxId;
    await save("verification.json", JSON.stringify(proof));
    const info = await sandbox.getInfo();
    proof.templateId = info.templateId;
    if (
        info.templateId !== TEMPLATE ||
        info.cpuCount !== 2 ||
        info.memoryMB !== 2048
    )
        throw new Error("VM resources differ from the 0.1 Pollen reservation");
    await sandbox.files.makeDir(REMOTE);
    await validateStack(stack);
} catch (error) {
    proof.status = "failed";
    proof.error = redact(error.message).slice(0, 1000);
    console.error(
        "Resolver validation failed; inspect private verification evidence.",
    );
    process.exitCode = 1;
} finally {
    if (sandbox) {
        try {
            proof.vmKilled = await sandbox.kill({
                signal: new AbortController().signal,
            });
            if (!proof.vmKilled) process.exitCode = 1;
        } catch {
            proof.cleanupError =
                "VM cleanup failed; bounded lease expires automatically";
            process.exitCode = 1;
        }
    }
    if (token && proof.keyBudgetBefore !== undefined) {
        try {
            const after = await account("/account/key");
            proof.spentPollen = Math.max(
                0,
                proof.keyBudgetBefore - after.pollenBudget,
            );
            if (proof.spentPollen > 0.1) {
                proof.budgetExceeded = true;
                process.exitCode = 1;
            }
        } catch {
            proof.spendingUnverified = true;
            process.exitCode = 1;
        }
    }
    if (process.exitCode === 1) proof.status = "failed";
    proof.finishedAt = new Date().toISOString();
    await save("verification.json", JSON.stringify(proof, null, 2));
}
