import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { CommandExitError, Sandbox } from "e2b";
import { dayKey } from "./analyze.mjs";
import {
    pilotDecision,
    RESERVATION,
    recordCompletion,
    stateFiles,
} from "./state.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");
const BASE = "https://gen.pollinations.ai";
const FIELD = "POLLINATIONS_API_KEY_AGENT_MODEL_MANAGER";
const TEMPLATE = "u1yrkaokyjzef8qchho5"; // Verified codex: 2 vCPU, 2 GiB; no automatic key creation.
const { values } = parseArgs({
    options: {
        out: { type: "string" },
        "verify-stack": { type: "boolean", default: false },
    },
});
const verifyStack = values["verify-stack"];
const out = resolve(
    values.out ?? join(HERE, verifyStack ? "data/stack" : "data"),
);
const REMOTE = verifyStack
    ? "/home/user/pollinations"
    : "/home/user/model-manager";
const purpose = verifyStack ? "stack-validation" : "report-only-pilot";
const reservation = verifyStack ? 0.1 : RESERVATION;
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
    // Store redacted diagnostics only in the encrypted run evidence, never CI logs.
    proof[`${stage}Log`] = redact(`${result.stdout}\n${result.stderr}`).slice(
        -100_000,
    );
    if (!acceptable.includes(result.exitCode))
        throw new Error(`${stage} failed with exit ${result.exitCode}`);
    console.log(`${stage}: exit ${result.exitCode}`);
}

async function exportReport() {
    const reportText = await sandbox.files.read(`${REMOTE}/data/report.json`);
    const report = JSON.parse(reportText);
    for (const name of [
        "report.json",
        "report.md",
        "notified.json",
        `snapshot-${dayKey(report.at)}.json`,
    ])
        await save(
            name,
            name === "report.json"
                ? reportText
                : await sandbox.files.read(`${REMOTE}/data/${name}`),
        );
    return report;
}

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
        "PATH=/home/user/mm-node/bin:/usr/local/bin:/usr/bin:/bin node operations/model-manager/stack.mjs",
        {
            timeoutMs: 600000,
            envs: { [FIELD]: token, TINYBIRD_READ_TOKEN: readToken },
        },
    );
    proof.results = JSON.parse(
        await sandbox.files.read(
            `${REMOTE}/operations/model-manager/data/stack-result.json`,
        ),
    );
    proof.status = "complete";
}

try {
    await mkdir(out, { recursive: true, mode: 0o700 });
    await rm(join(out, "report.md"), { force: true });
    if (!verifyStack) {
        try {
            pilot = JSON.parse(await readFile(join(out, "pilot.json"), "utf8"));
        } catch (error) {
            if (error.code !== "ENOENT") throw error;
        }
    }
    const decision = verifyStack ? "run" : pilotDecision(pilot);
    if (decision !== "run") {
        skipped = true;
        pilot.status = decision;
        proof.status = decision;
        console.log(`Pilot: ${decision}; no VM or inference call`);
    } else {
        token = secret(join(HERE, "secrets/prod.vars.json"), FIELD);
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
            key.pollenBudget < reservation
        )
            throw new Error(
                "Insufficient dedicated-key budget for the run reservation",
            );
        proof.keyBudgetBefore = key.pollenBudget;
        if (!verifyStack) {
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
            await save("pilot.json", JSON.stringify(pilot));
        }
        const existing = await account(
            `/alpha/e2b/v2/sandboxes?metadata=${encodeURIComponent(`agent=model-manager&purpose=${purpose}`)}&state=running&limit=100`,
        );
        if (!Array.isArray(existing) || existing.length)
            throw new Error(
                "A model-manager VM for this mode is already active; inspect it before retrying",
            );
        const stack = verifyStack ? await stackSource() : null;
        const source = verifyStack
            ? null
            : await (await import("./bundle.mjs")).sourceBundle();
        const replicate = verifyStack
            ? null
            : secret(
                  join(ROOT, "gen.pollinations.ai/secrets/prod.vars.json"),
                  "REPLICATE_API_TOKEN",
              );
        sandbox = await Sandbox.create(TEMPLATE, {
            apiKey: token,
            apiUrl: `${BASE}/alpha/e2b`,
            timeoutMs: verifyStack ? 1_200_000 : 600_000,
            requestTimeoutMs: 45_000,
            retries: 0,
            signal: abort.signal,
            lifecycle: { onTimeout: "kill" },
            metadata: {
                agent: "model-manager",
                purpose,
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
        await sandbox.files.makeDir(`${REMOTE}/data`);
        if (verifyStack) {
            await validateStack(stack);
        } else {
            proof.source = source.manifest;
            await sandbox.files.write(`${REMOTE}/run.mjs`, source.code);
            await command(
                "runtime-check",
                `echo '${source.manifest.bundleSha256}  run.mjs' | sha256sum -c - && node --version`,
            );
            const history = await stateFiles(out);
            const previousReport = history["report.json"]
                ? JSON.parse(history["report.json"])
                : null;
            const resume =
                previousReport?.assessmentInput &&
                dayKey(previousReport.at) === dayKey(proof.startedAt);
            proof.restoredSnapshotDays = Object.keys(history).filter((name) =>
                name.startsWith("snapshot-"),
            ).length;
            for (const [name, content] of Object.entries(history))
                if (
                    name.startsWith("snapshot-") ||
                    ["notified.json", "report.json"].includes(name)
                )
                    await sandbox.files.write(
                        `${REMOTE}/data/${name}`,
                        content,
                    );
            const options = {
                envs: {
                    [FIELD]: token,
                    REPLICATE_API_TOKEN: replicate,
                    MODEL_MANAGER_REPOSITORY_REVISION: source.manifest.revision,
                },
            };
            if (!resume) {
                await command(
                    "api-scan",
                    "node run.mjs --out /home/user/model-manager/data",
                    options,
                    [0, 2],
                );
                await exportReport(); // Preserve successful providers before inference.
            }
            proof.resumedAssessment = !!resume;
            let report;
            try {
                await command(
                    "assessment",
                    "node run.mjs --out /home/user/model-manager/data --assess-only",
                    { ...options, timeoutMs: 180_000 },
                    [0, 2],
                );
            } finally {
                report = await exportReport();
            }
            proof.coverageGaps = report.gaps.length;
            proof.findings = report.findings.length;
            proof.assessment = report.assessment.status;
            recordCompletion(pilot, report);
            proof.status = report.gaps.length
                ? "saved_with_source_gaps"
                : "saved";
            console.log(
                `Saved report: ${report.findings.length} leads, ${report.gaps.length} coverage gaps`,
            );
        }
    }
} catch (error) {
    proof.status = "failed";
    // Expected local messages are safe after redaction; never serialize SDK error objects.
    proof.error = redact(error.message).slice(0, 1000);
    console.error(
        "Model manager failed; inspect encrypted verification evidence.",
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
            if (proof.spentPollen > reservation) {
                proof.budgetExceeded = true;
                if (pilot) pilot.spentPollen = 2; // Stop until the reservation is reviewed.
                process.exitCode = 1;
            }
        } catch {
            proof.spendingUnverified = true;
            if (pilot) pilot.spentPollen += reservation;
            process.exitCode = 1;
        }
    }
    if (process.exitCode === 1) proof.status = "failed";
    proof.finishedAt = new Date().toISOString();
    if (pilot) await save("pilot.json", JSON.stringify(pilot));
    if (!skipped)
        await save("verification.json", JSON.stringify(proof, null, 2));
    if (process.env.GITHUB_OUTPUT)
        await writeFile(
            process.env.GITHUB_OUTPUT,
            `status=${proof.status}\ncheckpoint=${!skipped}\n`,
            { flag: "a" },
        );
}
