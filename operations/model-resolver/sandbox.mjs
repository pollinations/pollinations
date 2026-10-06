import { CommandExitError, RateLimitError, Sandbox } from "e2b";
import { CATALOGS } from "../model-pricing/catalogs.mjs";
import { API, hash, validateProviderContract } from "./pipeline.mjs";

const ROOT = "/home/user/pollinations";
const JOURNAL = "/home/user/model-management-journal";
const quote = (text) => `'${String(text).replaceAll("'", "'\\''")}'`;
const BOOTSTRAP =
    "sudo apt-get update -qq && sudo apt-get install -y -qq git curl ripgrep xz-utils && curl -fsSLO https://nodejs.org/dist/v24.10.0/node-v24.10.0-linux-x64.tar.xz && curl -fsSL https://nodejs.org/dist/v24.10.0/SHASUMS256.txt | grep ' node-v24.10.0-linux-x64.tar.xz$' | sha256sum -c - && mkdir -p /home/user/mm-node && tar -xJf node-v24.10.0-linux-x64.tar.xz -C /home/user/mm-node --strip-components=1";

// The journal lives in the VM, outside the editable checkout. mkdir is an atomic
// execution claim; a lost transport response never starts the same command twice.
export function journalScript(id, command, cwd) {
    if (!/^[a-f0-9]{64}$/.test(id))
        throw new Error("Invalid operation identity");
    return `#!/bin/bash
set -u
mkdir -p ${JOURNAL}
if ! mkdir ${JOURNAL}/${id}.lock 2>/dev/null; then exit 0; fi
set +e
timeout --signal=TERM --kill-after=10s 900s bash -c ${quote(`export PATH=/home/user/mm-node/bin:/usr/local/bin:/usr/bin:/bin; cd ${quote(cwd)} && ${command}`)} > ${JOURNAL}/${id}.stdout 2> ${JOURNAL}/${id}.stderr
code=$?
CODE=$code OP_ID=${id} python3 - <<'PY'
import json, os
p = '${JOURNAL}/' + os.environ['OP_ID']
def tail(name):
    with open(p + name, 'rb') as f:
        f.seek(0, 2)
        f.seek(max(0, f.tell() - 12000))
        return f.read().decode('utf-8', 'replace')
with open(p + '.tmp', 'w') as f:
    json.dump({'exitCode': int(os.environ['CODE']), 'stdout': tail('.stdout'), 'stderr': tail('.stderr')}, f)
os.replace(p + '.tmp', p + '.json')
PY
exit 0
`;
}

export class Workspace {
    constructor(env, save, sdk = Sandbox) {
        this.env = env;
        this.save = save;
        this.sdk = sdk;
    }
    options() {
        return {
            apiUrl: `${API}/alpha/e2b`,
            apiKey: this.env.POLLINATIONS_API_KEY,
            retries: 0,
            requestTimeoutMs: 30000,
        };
    }
    async connect(state) {
        const lease = Number(this.env.LEASE_MS ?? 600000);
        if (!Number.isFinite(lease) || lease < 60000 || lease > 600000)
            throw new Error("Invalid bounded VM lease");
        if (!this.reserve)
            throw new Error("VM spending guard is not configured");
        // Reserve full E2B list price for base (2 vCPU, 2 GiB), including a fresh
        // resumed lease. The current Pollinations promotion charges less.
        await this.reserve(
            state,
            (lease / 1000) * (2 * 0.000014 + 2 * 0.0000045),
        );
        if (!state.vm) {
            const found = [];
            const pages = this.sdk.list({
                ...this.options(),
                query: {
                    metadata: { pipeline: "model-management", task: state.id },
                    state: ["running", "paused"],
                },
            });
            while (pages.hasNext) found.push(...(await pages.nextItems()));
            if (found.length > 1)
                throw new Error("Multiple task VMs require reconciliation");
            if (found.length) state.vm = found[0].sandboxId;
            else {
                if (state.creatingVm)
                    throw new Error(
                        "VM creation result is uncertain; reconcile before renting another",
                    );
                state.creatingVm = true;
                await this.save(state);
                let created;
                try {
                    created = await this.sdk.create("base", {
                        ...this.options(),
                        timeoutMs: lease,
                        lifecycle: { onTimeout: "pause", autoResume: false },
                        network: { allowPublicTraffic: false },
                        metadata: {
                            pipeline: "model-management",
                            task: state.id,
                        },
                    });
                } catch (error) {
                    if (error instanceof RateLimitError) {
                        delete state.creatingVm;
                        await this.save(state);
                        error.retryable = true;
                    }
                    throw error;
                }
                state.vm = created.sandboxId;
                delete state.creatingVm;
                await this.save(state);
                return created;
            }
            await this.save(state);
        }
        return this.sdk.connect(state.vm, {
            ...this.options(),
            timeoutMs: lease,
        });
    }
    redact(text) {
        let result = String(text);
        for (const [name, value] of Object.entries(this.env))
            if (
                /key|token|secret|password/i.test(name) &&
                typeof value === "string" &&
                value.length > 4
            )
                result = result.replaceAll(value, "[redacted]");
        if (this.env.TEST_VARS_JSON) {
            const vars = JSON.parse(this.env.TEST_VARS_JSON);
            for (const fields of Object.values(vars))
                for (const value of Object.values(fields))
                    if (typeof value === "string" && value.length > 4)
                        result = result.replaceAll(value, "[redacted]");
        }
        return result.replace(/\b(?:sk|pk|ag)_[a-zA-Z0-9_-]+\b/g, "[redacted]");
    }
    async command(state, identity, command, cwd = ROOT, envs = {}) {
        const vm = await this.connect(state);
        const id = hash([state.id, identity]);
        const receipt = `${JOURNAL}/${id}.json`;
        if (await vm.files.exists(receipt))
            return JSON.parse(this.redact(await vm.files.read(receipt)));
        state.commands ??= {};
        if (state.commands[id] && Date.now() - state.commands[id] > 30 * 60000)
            throw new Error(
                "VM command exceeded its bounded receipt deadline; reconciliation required",
            );
        state.commands[id] ??= Date.now();
        await this.save(state);
        const script = `${JOURNAL}/${id}.sh`;
        await vm.files.makeDir(JOURNAL);
        await vm.files.write(script, journalScript(id, command, cwd));
        await vm.commands.run(`bash ${quote(script)}`, {
            background: true,
            timeoutMs: 0,
            envs,
        });
        return { pending: true };
    }
    async bootstrap(state, baseSha) {
        if (!/^[a-f0-9]{40}$/.test(baseSha ?? ""))
            throw new Error("Exact checkout revision required");
        const result = await this.command(
            state,
            `bootstrap:${baseSha}`,
            `${BOOTSTRAP} && git clone --no-checkout https://github.com/${this.env.REPOSITORY ?? "pollinations/pollinations"}.git ${ROOT} && git -C ${ROOT} checkout --detach ${baseSha} && PATH=/home/user/mm-node/bin:$PATH npm ci --ignore-scripts --no-audit --no-fund --prefix ${ROOT}`,
            "/home/user",
        );
        if (result.pending) return result;
        if (result.exitCode !== 0) throw new Error("Task VM bootstrap failed");
        state.baseSha = baseSha;
        await this.save(state);
        return result;
    }
    async policy(_state, evidence) {
        const response = await fetch(
            `https://api.github.com/repos/${this.env.REPOSITORY ?? "pollinations/pollinations"}/git/ref/heads/main`,
            {
                headers: { "User-Agent": "Pollinations-Model-Management" },
                signal: AbortSignal.timeout(30000),
            },
        );
        if (!response.ok)
            throw new Error("Current main revision could not be read");
        const baseSha = (await response.json()).object.sha;
        const names = [
            "AGENTS.md",
            ".claude/skills/model-management/SKILL.md",
            ".claude/skills/model-management/references/operating-policy.md",
            ".claude/skills/model-management/references/change-and-test-matrix.md",
            ".claude/skills/model-management/references/billing-verification.md",
            "shared/registry/registry.ts",
            "shared/registry/text.ts",
            "shared/registry/image.ts",
            "shared/registry/audio.ts",
            "gen.pollinations.ai/src/text/configs/providerConfigs.ts",
        ];
        const files = {};
        for (const name of names) {
            const res = await fetch(
                `https://raw.githubusercontent.com/${this.env.REPOSITORY ?? "pollinations/pollinations"}/${baseSha}/${name}`,
                { signal: AbortSignal.timeout(30000) },
            );
            if (!res.ok)
                throw new Error("Maintained policy context is unavailable");
            const text = await res.text();
            if (
                name.startsWith("shared/registry/") &&
                name !== "shared/registry/registry.ts"
            ) {
                const models = [
                    ...new Set(
                        (evidence?.records ?? [])
                            .map((r) => r.finding?.model ?? r.model)
                            .filter(Boolean),
                    ),
                ];
                const lines = text.split("\n");
                const indices = new Set();
                for (let i = 0; i < lines.length; i++)
                    if (
                        models.some((model) =>
                            lines[i].includes(JSON.stringify(model)),
                        )
                    )
                        for (
                            let j = Math.max(0, i - 10);
                            j < Math.min(lines.length, i + 100);
                            j++
                        )
                            indices.add(j);
                files[name] = {
                    scope: "Excerpts only; full source available in the task checkout at baseSha",
                    excerpts: [...indices]
                        .sort((a, b) => a - b)
                        .map((i) => `${i + 1}: ${lines[i]}`)
                        .join("\n")
                        .slice(0, 30000),
                };
            } else files[name] = text;
        }
        return { baseSha, files };
    }
    async collect(state) {
        const context = state.researchContext ?? (await this.policy(state));
        state.researchContext = context;
        await this.save(state);
        const boot = await this.bootstrap(state, context.baseSha);
        if (boot.pending) return boot;
        const out = "/home/user/research-output";
        const historyPath = "/home/user/discovery-history.json";
        if (state.kind === "discovery" && !state.historyLoaded) {
            const vm = await this.connect(state);
            await vm.files.write(
                historyPath,
                JSON.stringify(await this.history.load(state)),
            );
            state.historyLoaded = true;
            await this.save(state);
        }
        const providerEnv = Object.fromEntries(
            Object.entries(this.env).filter(
                ([key, value]) =>
                    (Object.values(CATALOGS).some(
                        (catalog) => catalog.key === key,
                    ) ||
                        /^(REPLICATE_API_TOKEN|FAL_KEY|OPENROUTER_API_KEY|DEEPINFRA_API_KEY|INFERENCEPORT_API_KEY|ELEVENLABS_API_KEY|GOOGLE_.*|AZURE_.*)$/.test(
                            key,
                        )) &&
                    typeof value === "string",
            ),
        );
        // Only trusted read-only collector code receives provider access. Coding tasks do not.
        const result = await this.command(
            state,
            "collect",
            `node operations/model-resolver/collect-research.mjs --kind ${state.kind} --out ${out}${state.kind === "discovery" ? ` --history ${historyPath}` : ""}${state.followUpRequest ? ` --follow-up ${quote(JSON.stringify(state.followUpRequest))}` : ""}`,
            ROOT,
            providerEnv,
        );
        if (result.pending) return result;
        if (result.exitCode !== 0)
            throw new Error(
                "Research collector failed; private VM journal contains diagnostics",
            );
        const vm = await this.connect(state);
        await this.history.retain(
            state,
            this.redact(
                await vm.files.read(
                    `${out}/${state.kind === "discovery" ? "snapshot" : "report"}.json`,
                ),
            ),
        );
        return JSON.parse(
            this.redact(await vm.files.read(`${out}/handoff.json`)),
        );
    }
    async prepare(state) {
        const result = await this.bootstrap(state, state.decision.baseSha);
        if (result.pending) return result;
        if (!state.providers) {
            const inventory = await this.command(
                state,
                "provider-inventory",
                `./node_modules/.bin/esbuild operations/model-pricing/inventory.ts --bundle --platform=node --format=cjs --tsconfig=gen.pollinations.ai/tsconfig.json --outfile=/home/user/provider-inventory.cjs >/dev/null 2>&1 && node -e ${quote("process.stdout.write(JSON.stringify([...new Set(require('/home/user/provider-inventory.cjs').inventory.map(row => row.provider))]))")}`,
            );
            if (inventory.pending) return inventory;
            if (inventory.exitCode !== 0)
                throw new Error(
                    "Maintained provider inventory could not be compiled",
                );
            state.providers = JSON.parse(inventory.stdout);
            await this.save(state);
        }
        validateProviderContract(state.decision, state.providers);
        if (state.devVarsWritten) return result;
        if (!this.env.TEST_VARS_JSON)
            throw new Error(
                "Approved staging test variables are not configured",
            );
        const vars = JSON.parse(this.env.TEST_VARS_JSON);
        if (!vars || Object.keys(vars).sort().join(",") !== "enter,gen")
            throw new Error("Test variables require Enter and Gen scopes");
        for (const fields of Object.values(vars)) {
            if (
                !fields ||
                typeof fields !== "object" ||
                Array.isArray(fields) ||
                !fields.BETTER_AUTH_SECRET ||
                Object.entries(fields).some(
                    ([key, value]) =>
                        !/^[A-Z][A-Z0-9_]*$/.test(key) ||
                        /^(GITHUB_TOKEN|SOPS_AGE_KEY|POLLINATIONS_API_KEY|CLOUDFLARE_.*)$/.test(
                            key,
                        ) ||
                        typeof value !== "string" ||
                        !value ||
                        value.length > 5000,
                )
            )
                throw new Error("Invalid protected test variables");
            for (const [key, token] of Object.entries(fields))
                if (/^TINYBIRD_.*TOKEN$/.test(key)) {
                    const response = await fetch(
                        "https://api.europe-west2.gcp.tinybird.co/v1/workspace",
                        {
                            headers: { Authorization: `Bearer ${token}` },
                            signal: AbortSignal.timeout(15000),
                        },
                    );
                    if (
                        !response.ok ||
                        (await response.json()).name !==
                            "pollinations_enter_staging"
                    )
                        throw new Error(
                            "Billing test credentials must target the staging workspace",
                        );
                }
        }
        const vm = await this.connect(state);
        for (const [scope, fields] of Object.entries(vars))
            await vm.files.write(
                `${ROOT}/${scope === "gen" ? "gen" : "enter"}.pollinations.ai/.dev.vars`,
                Object.entries(fields)
                    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
                    .join("\n"),
            );
        state.devVarsWritten = true;
        await this.save(state);
        return result;
    }
    async operation(state, callId, operation) {
        if (operation.operation === "scope")
            return { decision: state.decision, approval: state.approvals };
        const vm = await this.connect(state);
        const safeFile = async (path, tracked = false) => {
            // Reject symlinks, including symlink parents, before exposing VM files.
            const text = `import os, pathlib, sys\nr=pathlib.Path(${JSON.stringify(ROOT)})\np=r / ${JSON.stringify(path)}\nif any(x.is_symlink() for x in [p,*p.parents]) or p.resolve().is_relative_to(r) is False: sys.exit(1)\nif p.exists() and (not p.is_file() or p.stat().st_size > 100000): sys.exit(1)`;
            await vm.commands.run(
                `python3 -c ${quote(text)}${tracked ? ` && git ls-files --error-unmatch -- ${quote(path)}` : ""}`,
                { cwd: ROOT, timeoutMs: 10000 },
            );
        };
        if (operation.operation === "read") {
            await safeFile(operation.path, true);
            const content = this.redact(
                await vm.files.read(`${ROOT}/${operation.path}`),
            );
            return {
                content: content.slice(0, 24000),
                truncated: content.length > 24000,
            };
        }
        if (operation.operation === "write") {
            await safeFile(operation.path);
            const path = `${ROOT}/${operation.path}`;
            // A replay reconciles the desired bytes, not a second model decision.
            if (
                !(await vm.files.exists(path)) ||
                (await vm.files.read(path)) !== operation.content
            )
                await vm.files.write(path, operation.content);
            return { written: operation.path, sha256: hash(operation.content) };
        }
        if (operation.operation === "search") {
            let result;
            try {
                result = await vm.commands.run(
                    `git grep -n -F -- ${quote(operation.query)} -- shared/registry gen.pollinations.ai/src gen.pollinations.ai/test enter.pollinations.ai/src enter.pollinations.ai/test`,
                    { cwd: ROOT, timeoutMs: 10000 },
                );
            } catch (error) {
                if (
                    !(error instanceof CommandExitError) ||
                    error.exitCode !== 1
                )
                    throw error;
                result = error;
            }
            return { matches: this.redact(result.stdout).slice(0, 12000) };
        }
        const check = state.decision.checks.find(
            (item) => item.id === operation.checkId,
        );
        await this.maintainedCheck(vm, state, check);
        return this.command(
            state,
            `tool:${callId}`,
            check.command,
            `${ROOT}/${check.cwd}`,
        );
    }
    async changes(state) {
        const vm = await this.connect(state);
        const result = await vm.commands.run(
            `git diff --name-only ${state.baseSha} && git ls-files --others --exclude-standard`,
            { cwd: ROOT, timeoutMs: 10000 },
        );
        const paths = [
            ...new Set(result.stdout.trim().split("\n").filter(Boolean)),
        ];
        if (
            !paths.length ||
            paths.some((path) => !state.decision.paths.includes(path))
        )
            throw new Error("Candidate changes do not match approved paths");
        const files = [];
        for (const path of paths) {
            if (!(await vm.files.exists(`${ROOT}/${path}`)))
                throw new Error(
                    "File deletion is not supported by this approved write tool",
                );
            files.push({
                path,
                content: await vm.files.read(`${ROOT}/${path}`),
            });
        }
        return files;
    }
    async maintainedCheck(vm, state, check) {
        const paths = check.command
            .split(" ")
            .filter((arg) => arg.startsWith("test/"))
            .map((path) => `${check.cwd}/${path}`);
        for (const path of paths)
            await vm.commands.run(
                `git cat-file -e ${state.decision.baseSha}:${quote(path)} && git diff --exit-code ${state.decision.baseSha} -- ${quote(path)}`,
                { cwd: ROOT, timeoutMs: 10000 },
            );
    }
    async verify(state) {
        const candidate = state.candidate.sha;
        const checkout = await this.command(
            state,
            `checkout:${candidate}`,
            `git fetch origin ${quote(state.candidate.branch)} && git checkout --force --detach ${candidate} && git clean -fd`,
            ROOT,
        );
        if (checkout.pending) return checkout;
        if (checkout.exitCode !== 0)
            throw new Error("Candidate checkout failed");
        const checks = [];
        for (const check of state.decision.checks) {
            await this.maintainedCheck(await this.connect(state), state, check);
            const result = await this.command(
                state,
                `verify:${candidate}:${check.id}`,
                check.command,
                `${ROOT}/${check.cwd}`,
            );
            if (result.pending) return result;
            checks.push({
                id: check.id,
                exitCode: result.exitCode,
                stdout: result.stdout,
                stderr: result.stderr,
            });
        }
        const vm = await this.connect(state);
        const actual = await vm.commands.run(
            "git rev-parse HEAD && git status --porcelain",
            { cwd: ROOT, timeoutMs: 10000 },
        );
        if (actual.stdout.trim() !== candidate)
            throw new Error("Verification changed the candidate checkout");
        return { sha: candidate, checks };
    }
    async pause(state) {
        if (state.vm && !(await this.sdk.pause(state.vm, this.options())))
            throw new Error("Task VM pause failed");
    }
    async close(state) {
        if (state.vm && !state.vmKilled) {
            state.vmKilled = await this.sdk.kill(state.vm, this.options());
            await this.save(state);
            if (!state.vmKilled) throw new Error("Task VM cleanup failed");
        }
    }
}
