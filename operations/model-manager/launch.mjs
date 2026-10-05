import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { CommandExitError, Sandbox } from "e2b";
import { dayKey } from "./analyze.mjs";
import { sourceBundle } from "./bundle.mjs";
import { pilotDecision, stateFiles } from "./state.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const BASE = "https://gen.pollinations.ai";
const REMOTE = "/home/user/model-manager";
const FIELD = "POLLINATIONS_API_KEY_AGENT_MODEL_MANAGER";
const TEMPLATE = "u1yrkaokyjzef8qchho5"; // Verified codex: 2 vCPU, 2 GiB; no automatic key creation.
const RESERVATION = 0.1222; // 600s at full list compute price (0.0222) + 0.1 inference.
const { values } = parseArgs({
    options: {
        out: { type: "string", default: join(HERE, "data") },
        secrets: {
            type: "string",
            default: join(HERE, "secrets/prod.vars.json"),
        },
        "provider-secrets": {
            type: "string",
            default: join(ROOT, "gen.pollinations.ai/secrets/prod.vars.json"),
        },
    },
});
const out = resolve(values.out);
const proof = {
    startedAt: new Date().toISOString(),
    trigger: process.env.GITHUB_RUN_ID ?? "local",
    attempt: process.env.GITHUB_RUN_ATTEMPT ?? "1",
    status: "starting",
    stages: [],
};
let sandbox;
let pilot;
let token;
let skipped = false;
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
        result = await sandbox.commands.run(
            `export PATH=/home/user/mm-node/bin:/usr/local/bin:/usr/bin:/bin; ${commandText}`,
            {
                cwd: REMOTE,
                timeoutMs: 180_000,
                signal: abort.signal,
                ...options,
            },
        );
    } catch (error) {
        if (!(error instanceof CommandExitError)) throw error;
        result = error;
    }
    proof.stages.push({ stage, exitCode: result.exitCode });
    // Store redacted diagnostics only in the encrypted run evidence, never CI logs.
    proof[`${stage}Log`] = redact(`${result.stdout}\n${result.stderr}`).slice(
        -100_000,
    );
    if (!acceptable.includes(result.exitCode))
        throw new Error(`${stage} failed with exit ${result.exitCode}`);
    console.log(`${stage}: exit ${result.exitCode}`);
}

try {
    await mkdir(out, { recursive: true, mode: 0o700 });
    try {
        pilot = JSON.parse(await readFile(join(out, "pilot.json"), "utf8"));
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
    }
    const decision = pilotDecision(pilot);
    if (decision !== "run") {
        skipped = true;
        pilot.status = decision;
        proof.status = decision;
        console.log(`Pilot: ${decision}; no VM or inference call`);
    } else {
        token = secret(values.secrets, FIELD);
        const replicate = secret(
            values["provider-secrets"],
            "REPLICATE_API_TOKEN",
        );
        const fal = secret(values["provider-secrets"], "FAL_KEY");
        const profile = await account("/account/profile");
        if (profile.email !== "pollinationsagent@gmail.com")
            throw new Error("Wrong agent account");
        const key = await account("/account/key");
        if (
            !key.permissions?.account?.includes("machines") ||
            key.permissions.account.includes("keys")
        )
            throw new Error(
                "Agent needs machines access without key-management access",
            );
        if (
            !Number.isFinite(key.pollenBudget) ||
            key.pollenBudget < RESERVATION
        )
            throw new Error(
                "Insufficient dedicated-key budget for the run reservation",
            );
        proof.keyBudgetBefore = key.pollenBudget;
        pilot ??= {
            startedDay: dayKey(proof.startedAt),
            days: [],
            spentPollen: 0,
        };
        pilot.initialKeyBudget ??= key.pollenBudget + pilot.spentPollen;
        // Reconcile a previous interrupted run from the dedicated key's ledger.
        pilot.spentPollen = Math.max(
            pilot.spentPollen,
            pilot.initialKeyBudget - key.pollenBudget,
        );
        if (pilotDecision(pilot) !== "run")
            throw new Error(
                "Pilot budget exhausted after reconciling earlier spending",
            );
        const existing = await account(
            "/alpha/e2b/v2/sandboxes?metadata=agent%3Dmodel-manager%26purpose%3Dreport-only-pilot&state=running&limit=100",
        );
        if (!Array.isArray(existing) || existing.length)
            throw new Error(
                "A pilot VM is already active; inspect it before retrying",
            );
        const source = await sourceBundle();
        proof.source = source.manifest;
        await save("pilot.json", JSON.stringify(pilot));
        sandbox = await Sandbox.create(TEMPLATE, {
            apiKey: token,
            apiUrl: `${BASE}/alpha/e2b`,
            timeoutMs: 600_000,
            requestTimeoutMs: 45_000,
            retries: 0,
            signal: abort.signal,
            lifecycle: { onTimeout: "kill" },
            metadata: {
                agent: "model-manager",
                purpose: "report-only-pilot",
                trigger: proof.trigger,
            },
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
            throw new Error(
                "VM resources differ from the approved run reservation",
            );
        await sandbox.files.write(
            "/home/user/source.tar.gz",
            source.archive.buffer.slice(
                source.archive.byteOffset,
                source.archive.byteOffset + source.archive.byteLength,
            ),
        );
        await command(
            "runtime-setup",
            `set -euo pipefail
mkdir -p /home/user/mm-node ${REMOTE}
cd /home/user
echo '${source.manifest.bundleSha256}  source.tar.gz' | sha256sum -c -
curl -fsSL https://nodejs.org/dist/v24.10.0/node-v24.10.0-linux-x64.tar.xz -o node.tar.xz
curl -fsSL https://nodejs.org/dist/v24.10.0/SHASUMS256.txt -o node-shasums.txt
awk '$2 == "node-v24.10.0-linux-x64.tar.xz" { print $1 "  node.tar.xz" }' node-shasums.txt | sha256sum -c -
tar -xJf node.tar.xz --strip-components=1 -C /home/user/mm-node
tar -xzf source.tar.gz -C ${REMOTE}
export PATH=/home/user/mm-node/bin:/usr/local/bin:/usr/bin:/bin
cd ${REMOTE}
node --version
npm ci --ignore-scripts --no-audit --no-fund
mkdir -p operations/model-manager/data`,
            { cwd: "/home/user", timeoutMs: 240_000 },
        );
        const history = await stateFiles(out);
        proof.restoredSnapshotDays = Object.keys(history).filter((name) =>
            name.startsWith("snapshot-"),
        ).length;
        for (const [name, content] of Object.entries(history))
            if (name.startsWith("snapshot-") || name === "notified.json")
                await sandbox.files.write(
                    `${REMOTE}/operations/model-manager/data/${name}`,
                    content,
                );
        await command(
            "agent-tests",
            "node --test operations/model-manager/run.test.mjs",
        );
        await command(
            "workers-test",
            "../node_modules/.bin/vitest run test/pollen-precision.test.ts",
            { cwd: `${REMOTE}/gen.pollinations.ai` },
        );
        await command(
            "api-scan",
            "node --import tsx operations/model-manager/run.ts --assess",
            {
                envs: {
                    [FIELD]: token,
                    REPLICATE_API_TOKEN: replicate,
                    FAL_KEY: fal,
                    MODEL_MANAGER_REPOSITORY_REVISION: source.manifest.revision,
                    MODEL_MANAGER_SANDBOX_ID: sandbox.sandboxId,
                },
            },
            [0, 2],
        );
        const reportText = await sandbox.files.read(
            `${REMOTE}/operations/model-manager/data/report.json`,
        );
        const report = JSON.parse(reportText);
        const snapshot = `snapshot-${dayKey(report.at)}.json`;
        for (const name of [
            "report.json",
            "report.html",
            "notified.json",
            snapshot,
        ])
            await save(
                name,
                name === "report.json"
                    ? reportText
                    : await sandbox.files.read(
                          `${REMOTE}/operations/model-manager/data/${name}`,
                      ),
            );
        pilot.days = [...new Set([...pilot.days, dayKey(report.at)])];
        pilot.status = "observing";
        proof.coverageGaps = report.gaps.length;
        proof.findings = report.findings.length;
        proof.assessment = report.assessment.status;
        if (report.assessment.status !== "complete")
            throw new Error("Assessment incomplete; source evidence saved");
        proof.status = report.gaps.length ? "saved_with_source_gaps" : "saved";
        console.log(
            `Saved report: ${report.findings.length} leads, ${report.gaps.length} coverage gaps`,
        );
    }
} catch (error) {
    proof.status = "failed";
    // Expected local messages are safe after redaction; never serialize SDK error objects.
    proof.error = redact(error.message).slice(0, 1000);
    console.error(
        "Model manager pilot failed; inspect encrypted verification evidence.",
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
            if (pilot) pilot.spentPollen += proof.spentPollen;
            if (proof.spentPollen > RESERVATION) {
                proof.budgetExceeded = true;
                if (pilot) pilot.spentPollen = 2; // Stop until the reservation is reviewed.
                process.exitCode = 1;
            }
        } catch {
            proof.spendingUnverified = true;
            if (pilot) pilot.spentPollen += RESERVATION;
            process.exitCode = 1;
        }
    }
    proof.finishedAt = new Date().toISOString();
    if (pilot) await save("pilot.json", JSON.stringify(pilot));
    if (!skipped)
        await save("verification.json", JSON.stringify(proof, null, 2));
}
