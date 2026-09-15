import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

// The UI's prefixed utilities must be compiled before Enter's unprefixed
// stylesheet imports them. Use the package's build, not a second CSS recipe.
export async function buildSourceStyles() {
    await promisify(execFile)("npm", ["run", "build:css"], {
        cwd: fileURLToPath(new URL("../../packages/ui", import.meta.url)),
    });
}
