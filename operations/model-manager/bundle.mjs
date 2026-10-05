import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const HERE = dirname(fileURLToPath(import.meta.url));

// Build on the trusted host; the VM receives one executable and no dependencies.
export async function sourceBundle() {
    const revision = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: resolve(HERE, "../.."),
        encoding: "utf8",
    }).trim();
    const result = await build({
        entryPoints: [join(HERE, "run.ts")],
        bundle: true,
        platform: "node",
        format: "esm",
        target: "node20",
        nodePaths: [join(HERE, "node_modules")],
        write: false,
    });
    const code = result.outputFiles[0].text;
    return {
        code,
        manifest: {
            revision,
            bundleSha256: createHash("sha256").update(code).digest("hex"),
        },
    };
}
