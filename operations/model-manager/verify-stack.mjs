// Manual validation: the same customer sandbox API, with an isolated checkout.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { Sandbox } from "e2b";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = "https://gen.pollinations.ai";
const FIELD = "POLLINATIONS_API_KEY_AGENT_MODEL_MANAGER";
const { values } = parseArgs({
    options: {
        out: {
            type: "string",
            default: join(ROOT, "operations/model-manager/data/stack"),
        },
    },
});
const out = resolve(values.out);
await mkdir(out, { recursive: true, mode: 0o700 });
function secret(file, field) {
    try {
        const value =
            process.env[field] ||
            execFileSync(
                "sops",
                ["decrypt", "--extract", `["${field}"]`, join(ROOT, file)],
                { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
            ).trim();
        if (!value) throw new Error();
        return value;
    } catch {
        throw new Error(`Existing ${field} is unavailable`);
    }
}
const token = secret("operations/model-manager/secrets/prod.vars.json", FIELD);
const gen = Object.fromEntries(
    [
        "AZURE_MYCELI_PROD_API_KEY",
        "BETTER_AUTH_SECRET",
        "TINYBIRD_INGEST_TOKEN",
    ].map((name) => [
        name,
        secret("gen.pollinations.ai/secrets/dev.vars.json", name),
    ]),
);
const enter = {
    BETTER_AUTH_SECRET: secret(
        "enter.pollinations.ai/secrets/dev.vars.json",
        "BETTER_AUTH_SECRET",
    ),
};
const readToken = secret(
    "enter.pollinations.ai/secrets/dev.vars.json",
    "TINYBIRD_READ_TOKEN",
);
const secrets = [
    token,
    readToken,
    ...Object.values(gen),
    ...Object.values(enter),
];
const redact = (value) =>
    secrets.reduce(
        (text, secret) => text.split(secret).join("[REDACTED]"),
        String(value),
    );
const proof = { startedAt: new Date().toISOString(), stages: [] };
let sandbox, before;
const abort = new AbortController();
process.once("SIGINT", () => abort.abort());
process.once("SIGTERM", () => abort.abort());
async function account(path) {
    const response = await fetch(`${BASE}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Account HTTP ${response.status}`);
    return response.json();
}
async function run(stage, command, options = {}) {
    console.log(`Starting ${stage}`);
    const result = await sandbox.commands.run(command, {
        cwd: "/home/user/pollinations",
        timeoutMs: 600000,
        signal: abort.signal,
        onStdout: (chunk) => {
            for (const line of chunk.split("\n"))
                if (
                    [
                        "Installing checkout dependencies",
                        "Building Enter and Gen",
                        "Checking Enter authentication",
                        "Registering the local private prompt agent",
                        "Checking the Gen account proxy",
                        "Running private prompt-agent inference",
                    ].includes(line)
                )
                    console.log(`VM: ${line}`);
        },
        ...options,
    });
    proof.stages.push({ stage, exitCode: result.exitCode });
    if (result.exitCode !== 0) throw new Error(`${stage} failed`);
}
try {
    if (
        (await account("/account/profile")).email !==
        "pollinationsagent@gmail.com"
    )
        throw new Error("Wrong agent account");
    before = await account("/account/key");
    if (
        !before.permissions?.account?.includes("machines") ||
        before.permissions.account.includes("keys") ||
        before.pollenBudget < 0.1
    )
        throw new Error(
            "Unexpected runtime permissions or insufficient 0.1-Pollen VM reservation",
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
    const existing = await account(
        "/alpha/e2b/v2/sandboxes?metadata=agent%3Dmodel-manager%26purpose%3Dstack-validation&state=running&limit=100",
    );
    if (!Array.isArray(existing) || existing.length)
        throw new Error(
            "A validation VM is already active; inspect it before retrying",
        );
    const files = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT })
        .toString()
        .split("\0")
        .filter(
            (name) =>
                name &&
                !name.includes("/secrets/") &&
                name !== "operations/model-manager/agent.ts",
        );
    files.push(
        "operations/model-manager/agent.json",
        "operations/model-manager/stack.mjs",
        "operations/model-manager/verify-stack.mjs",
    );
    // Use the working files, including this PR's edits; no ignored credentials.
    const archive = execFileSync(
        "tar",
        ["-czf", "-", "--no-xattrs", "--null", "-T", "-"],
        {
            cwd: ROOT,
            env: { ...process.env, COPYFILE_DISABLE: "1" },
            input: Buffer.from(`${[...new Set(files)].join("\0")}\0`),
            maxBuffer: 128 * 1024 * 1024,
        },
    );
    proof.revision = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: ROOT,
        encoding: "utf8",
    }).trim();
    proof.archiveSha256 = createHash("sha256").update(archive).digest("hex");
    sandbox = await Sandbox.create("u1yrkaokyjzef8qchho5", {
        apiKey: token,
        apiUrl: `${BASE}/alpha/e2b`,
        timeoutMs: 1200000,
        requestTimeoutMs: 45000,
        retries: 0,
        signal: abort.signal,
        lifecycle: { onTimeout: "kill" },
        metadata: { agent: "model-manager", purpose: "stack-validation" },
    });
    proof.sandboxId = sandbox.sandboxId;
    const info = await sandbox.getInfo();
    proof.resources = {
        templateId: info.templateId,
        cpuCount: info.cpuCount,
        memoryMB: info.memoryMB,
    };
    if (
        info.templateId !== "u1yrkaokyjzef8qchho5" ||
        info.cpuCount !== 2 ||
        info.memoryMB !== 2048
    )
        throw new Error(
            "VM resources differ from the approved compute reservation",
        );
    await sandbox.files.makeDir("/home/user/pollinations");
    await sandbox.files.write("/home/user/source.tgz", archive);
    await run(
        "bootstrap",
        "tar -xzf /home/user/source.tgz && curl -fsSLO https://nodejs.org/dist/v24.10.0/node-v24.10.0-linux-x64.tar.xz && curl -fsSL https://nodejs.org/dist/v24.10.0/SHASUMS256.txt | grep ' node-v24.10.0-linux-x64.tar.xz$' | sha256sum -c - && mkdir -p /home/user/mm-node && tar -xJf node-v24.10.0-linux-x64.tar.xz -C /home/user/mm-node --strip-components=1",
    );
    const dotenv = (data) =>
        `${Object.entries(data)
            .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
            .join("\n")}\n`;
    await sandbox.files.write(
        "/home/user/pollinations/gen.pollinations.ai/.dev.vars",
        dotenv(gen),
    );
    await sandbox.files.write(
        "/home/user/pollinations/enter.pollinations.ai/.dev.vars",
        dotenv(enter),
    );
    await run(
        "enter-gen-e2e",
        "PATH=/home/user/mm-node/bin:/usr/local/bin:/usr/bin:/bin node operations/model-manager/stack.mjs",
        { envs: { [FIELD]: token, TINYBIRD_READ_TOKEN: readToken } },
    );
    proof.results = JSON.parse(
        await sandbox.files.read(
            "/home/user/pollinations/operations/model-manager/data/stack-result.json",
        ),
    );
    proof.status = "complete";
} catch (error) {
    proof.status = "failed";
    proof.error = redact(error.message).slice(0, 1000);
    proof.diagnostics = redact(
        `${error.stdout ?? ""}\n${error.stderr ?? ""}`,
    ).slice(-100000);
    console.error(
        "Stack verification failed; inspect private verification evidence.",
    );
    process.exitCode = 1;
} finally {
    if (sandbox) {
        try {
            proof.vmKilled = await sandbox.kill();
            if (!proof.vmKilled) process.exitCode = 1;
        } catch {
            proof.cleanupError =
                "VM cleanup failed; bounded lease expires automatically";
            process.exitCode = 1;
        }
    }
    if (before) {
        try {
            proof.spentPollen = Math.max(
                0,
                before.pollenBudget -
                    (await account("/account/key")).pollenBudget,
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
    proof.finishedAt = new Date().toISOString();
    if (process.exitCode) proof.status = "failed";
    await writeFile(
        join(out, "verification.json"),
        JSON.stringify(proof, null, 2),
        { mode: 0o600 },
    );
    if (process.env.GITHUB_OUTPUT)
        await writeFile(process.env.GITHUB_OUTPUT, "checkpoint=true\n", {
            flag: "a",
        });
    console.log(
        `Stack verification: ${proof.status}; VM cleanup: ${proof.vmKilled === true}`,
    );
}
