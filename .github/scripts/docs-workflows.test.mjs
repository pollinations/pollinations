import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, matchesGlob, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const read = (path) => readFile(join(repository, path), "utf8");
const [ci, production, regeneration] = await Promise.all(
    [
        "ci-pull-request-checks",
        "deploy-cloudflare-production",
        "docs-regenerate-api-reference",
    ].map(async (name) => parse(await read(`.github/workflows/${name}.yml`))),
);
const selection = ci.jobs.gen.steps.find((step) => step.id === "gen-files").run;
const ciPattern = new RegExp(selection.match(/grep -E '([^']+)'/)[1]);
const productionPaths = production.on.push.paths;
const genPaths = parse(
    production.jobs.changes.steps.find((step) => step.id === "filter").with
        .filters,
).gen;
const gate = regeneration.jobs.gate.steps.find(
    (step) => step.id === "check",
).run;

function run(command, args, options = {}) {
    const result = spawnSync(command, args, { encoding: "utf8", ...options });
    assert.equal(result.status, 0, result.error?.message || result.stderr);
    return result.stdout;
}

test("raw imports select Gen CI and worker inputs select deployment", async () => {
    const inputs = { src: new Set(), test: new Set() };
    for (const source of ["src", "test"]) {
        const directory = `gen.pollinations.ai/${source}`;
        for (const file of await readdir(join(repository, directory), {
            recursive: true,
        })) {
            if (!/\.[cm]?[jt]sx?$/.test(file)) continue;
            const path = join(directory, file);
            for (const match of (await read(path)).matchAll(
                /^\s*import\s+[^;]*?\sfrom\s+["']([^"']+)\?raw["']/gm,
            )) {
                inputs[source].add(
                    relative(
                        repository,
                        resolve(repository, dirname(path), match[1]),
                    ),
                );
            }
        }
        for (const path of inputs[source]) {
            assert.ok(ciPattern.test(path), `Gen CI misses ${path}`);
            if (source === "src") {
                assert.ok(
                    productionPaths.some((glob) => matchesGlob(path, glob)),
                    `production trigger misses ${path}`,
                );
                assert.ok(
                    genPaths.some((glob) => matchesGlob(path, glob)),
                    `Gen deployment misses ${path}`,
                );
            }
        }
    }
    assert.ok(
        inputs.src.size > 0,
        "must discover raw documentation dependencies",
    );
    for (const path of [
        "README.md",
        "APIDOCS.md",
        "packages/polli-cli/src/index.ts",
    ]) {
        assert.equal(ciPattern.test(path), false, path);
        assert.equal(
            productionPaths.some((glob) => matchesGlob(path, glob)),
            false,
            path,
        );
        assert.equal(
            genPaths.some((glob) => matchesGlob(path, glob)),
            false,
            path,
        );
    }
});

test("unrelated UI and MCP changes do not select Gen CI", () => {
    for (const path of [
        "packages/ui/src/compositions/Prose.tsx",
        "packages/mcp/README.md",
    ]) {
        assert.equal(ciPattern.test(path), false, path);
    }
    for (const path of [
        "packages/ui/src/compositions/Prose.tsx",
        "pollinations.ai/public/legal/SUBPROCESSORS.md",
    ]) {
        assert.equal(
            genPaths.some((glob) => matchesGlob(path, glob)),
            false,
            path,
        );
    }
});

for (const change of ["deleting", "renaming"]) {
    test(`${change} an imported guide still runs Gen checks`, async () => {
        const directory = await mkdtemp(join(tmpdir(), "docs-workflow-"));
        try {
            const git = (...args) =>
                run(
                    "git",
                    [
                        "-c",
                        "user.name=Test",
                        "-c",
                        "user.email=test@example.com",
                        "-c",
                        "commit.gpgsign=false",
                        ...args,
                    ],
                    { cwd: directory },
                );
            git("init", "--quiet");
            git("config", "diff.renames", "true");
            const guide = "BRING_YOUR_OWN_POLLEN.md";
            await writeFile(join(directory, guide), "Guide\n");
            git("add", guide);
            git("commit", "--quiet", "-m", "Add guide");
            if (change === "renaming") {
                git("mv", guide, "WALLET_GUIDE.md");
            } else {
                git("rm", "--quiet", guide);
            }
            git("commit", "--quiet", "-m", `${change} guide`);
            const output = join(directory, "output");
            run("bash", ["-e"], {
                cwd: directory,
                input: selection,
                env: { ...process.env, GITHUB_OUTPUT: output },
            });
            const result = await readFile(output, "utf8");
            assert.match(result, /any_changed=true/);
            assert.ok(result.includes(`files<<EOF\n${guide}\nEOF\n`));
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    });
}

test("the regeneration gate checks successful schema deployments across pages", () => {
    const query = gate.match(/jq -r '([^']+)'/)[1];
    const job = (name, conclusion = "success") => ({ name, conclusion });
    const cases = [
        ...["deploy-enter", "deploy-gen", "deploy-media"].map((name) => [
            [[job(name)]],
            true,
        ]),
        [[[job("deploy-enter"), job("deploy-gen"), job("deploy-media")]], true],
        [[[job("deploy-enter"), job("deploy-gen", "failure")]], true],
        ...["skipped", "failure", "cancelled"].map((conclusion) => [
            [[job("deploy-gen", conclusion)]],
            false,
        ]),
        [[[job("test-gen"), job("deploy-gen", null)]], false],
        [[[]], false],
        [[[job("deploy-gen", "failure")], [job("deploy-media")]], true],
    ];
    for (const [pages, expected] of cases) {
        assert.equal(
            run("jq", ["-r", query], {
                input: JSON.stringify(pages.map((jobs) => ({ jobs }))),
            }).trim(),
            String(expected),
            JSON.stringify(pages),
        );
    }
});
