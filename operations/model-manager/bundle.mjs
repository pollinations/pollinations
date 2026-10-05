import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../..");

export async function sourceBundle() {
    const revision = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: ROOT,
        encoding: "utf8",
    }).trim();
    const paths = [
        "package.json",
        "package-lock.json",
        "shared",
        "gen.pollinations.ai/src",
        "gen.pollinations.ai/test",
        "gen.pollinations.ai/public",
        "gen.pollinations.ai/package.json",
        "gen.pollinations.ai/wrangler.toml",
        "gen.pollinations.ai/vitest.config.ts",
        "gen.pollinations.ai/tsconfig.json",
        "enter.pollinations.ai/src",
        "enter.pollinations.ai/drizzle",
        "enter.pollinations.ai/scripts/code-agent-sdk.mjs",
        "enter.pollinations.ai/tsconfig.json",
        "media.pollinations.ai/src",
        "media.pollinations.ai/tsconfig.json",
        "packages/ui/src",
        "BRING_YOUR_OWN_MODEL.md",
        "BRING_YOUR_OWN_POLLEN.md",
        "BUILD_YOUR_OWN_AGENT.md",
        "CODING_HARNESSES.md",
        "packages/polli-cli/README.md",
        "packages/polli-cli/SKILL.md",
        "packages/polli-cli/TASKS.md",
    ];
    const rootPackage = JSON.parse(
        await readFile(join(ROOT, "package.json"), "utf8"),
    );
    paths.push(...rootPackage.workspaces.map((path) => `${path}/package.json`));
    const files = execFileSync("git", ["ls-files", "-z", "--", ...paths], {
        cwd: ROOT,
        encoding: "utf8",
    })
        .split("\0")
        .filter(
            (name) => name && !/(^|\/)(secrets|data|node_modules)\//.test(name),
        );
    const directory = await mkdtemp(join(tmpdir(), "model-manager-source-"));
    try {
        execFileSync("tar", ["-xf", "-", "-C", directory], {
            env: { ...process.env, COPYFILE_DISABLE: "1" },
            input: execFileSync(
                "git",
                ["archive", "--format=tar", revision, ...files],
                {
                    cwd: ROOT,
                    maxBuffer: 64 * 1024 * 1024,
                },
            ),
        });
        const agent = join(directory, "operations/model-manager");
        await mkdir(agent, { recursive: true });
        const agentFiles = {};
        for (const name of [
            "run.ts",
            "analyze.mjs",
            "collectors.mjs",
            "run.test.mjs",
        ]) {
            const content = await readFile(join(HERE, name));
            await writeFile(join(agent, name), content);
            agentFiles[name] = createHash("sha256")
                .update(content)
                .digest("hex");
        }
        const archive = execFileSync(
            "tar",
            ["-czf", "-", "-C", directory, "."],
            {
                maxBuffer: 32 * 1024 * 1024,
                // macOS AppleDouble files otherwise become bogus *.sql migrations in Linux.
                env: { ...process.env, COPYFILE_DISABLE: "1" },
            },
        );
        return {
            archive,
            manifest: {
                revision,
                agentFiles,
                bundleSha256: createHash("sha256")
                    .update(archive)
                    .digest("hex"),
            },
        };
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}
