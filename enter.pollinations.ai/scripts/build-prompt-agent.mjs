import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const entryPoint = fileURLToPath(
    new URL("../src/services/prompt-agent-worker.ts", import.meta.url),
);
const outputFile = fileURLToPath(
    new URL("../src/services/dist/prompt-agent-worker.js", import.meta.url),
);

const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    write: false,
    platform: "browser",
    format: "esm",
    target: "es2022",
    minify: true,
    legalComments: "none",
});
const source = result.outputFiles[0].text.replace(/^[ \t]+$/gm, "");

if (process.argv.includes("--check")) {
    const generated = await readFile(outputFile, "utf8").catch(() => "");
    if (generated !== source) {
        console.error(
            "Prompt-agent bundle is stale. Run npm run build:prompt-agent.",
        );
        process.exitCode = 1;
    }
} else {
    await mkdir(new URL("../src/services/dist/", import.meta.url), {
        recursive: true,
    });
    await writeFile(outputFile, source);
    console.log(`Built ${outputFile} (${source.length} bytes)`);
}
