import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

// The UI's prefixed utilities must be compiled before Enter's unprefixed
// stylesheet imports them. Its relative font URLs also need the package's
// generated fonts, including on a fresh checkout without a prior UI build.
export async function buildSourceStyles() {
    await Promise.all(
        ["build:css", "build:fonts"].map((script) =>
            promisify(execFile)("npm", ["run", script], {
                cwd: fileURLToPath(
                    new URL("../../packages/ui", import.meta.url),
                ),
            }),
        ),
    );
}
