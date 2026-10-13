import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const outputPath = resolve(root, ".dev.vars");

const result = spawnSync(
    "sops",
    [
        "exec-file",
        "--no-fifo",
        "secrets/dev.vars.json",
        "node scripts/push-generation-secrets.mjs {} local",
    ],
    { cwd: root, encoding: "utf8", stdio: ["inherit", "inherit", "pipe"] },
);

// Contributors have no sops (ENOENT) or no maintainer key (sops exits 128):
// keep their own .dev.vars instead of failing.
if (result.error?.code !== "ENOENT" && result.status !== 128) {
    process.stderr.write(result.stderr ?? "");
    process.exit(result.status ?? 1);
}

if (existsSync(outputPath)) {
    console.log("No SOPS key for secrets/dev.vars.json; keeping .dev.vars");
} else {
    copyFileSync(resolve(root, ".dev.vars.example"), outputPath);
    console.log(
        "No SOPS key for secrets/dev.vars.json; created .dev.vars from .dev.vars.example",
    );
}
