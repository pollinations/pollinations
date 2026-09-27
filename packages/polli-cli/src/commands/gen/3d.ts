import { writeFileSync } from "node:fs";
import { Command } from "commander";
import { exitWithError, fetchGen } from "../../lib/errors.js";
import {
    getOutputMode,
    printError,
    printInfo,
    printMeta,
} from "../../lib/output.js";

function extensionFor(contentType: string | null, model?: string): string {
    if (contentType?.includes("ply")) return "ply";
    if (model === "nvidia/asset-harvester") return "ply";
    return "glb";
}

export function create3dCommand() {
    return new Command("3d")
        .description("Generate a 3D model from text and/or reference images")
        .addHelpText(
            "after",
            `\nExamples:\n  polli gen 3d "a red fox"\n  polli gen 3d --image https://example.com/ref.png --model nvidia/asset-harvester\n`,
        )
        .argument("[prompt]", "Text description (optional if --image is given)")
        .option("--model <model>", "3D model")
        .option("--resolution <res>", "Output resolution")
        .option("--seed <n>", "Seed for deterministic output")
        .option(
            "--image <url>",
            "Reference image URL (repeatable)",
            (val: string, prev: string[]) => [...prev, val],
            [] as string[],
        )
        .option("--output <path>", "Save to file")
        .action(async (promptArg, opts) => {
            const isHuman = getOutputMode() === "human";

            if (!promptArg && opts.image.length === 0) {
                printError("Provide a prompt, --image, or both.");
                process.exit(1);
            }

            const params = new URLSearchParams();
            if (opts.model) params.set("model", opts.model);
            if (opts.resolution) params.set("resolution", opts.resolution);
            if (opts.seed) params.set("seed", opts.seed);
            for (const url of opts.image as string[]) {
                params.append("image", url);
            }

            const encodedPrompt = encodeURIComponent(promptArg ?? "");
            const path = `/3d/${encodedPrompt}?${params}`;

            if (isHuman) printInfo("Generating 3D model...");

            try {
                const res = await fetchGen(path);
                const buffer = Buffer.from(await res.arrayBuffer());
                const ext = extensionFor(res.headers.get("content-type"), opts.model);
                const output = opts.output ?? `model.${ext}`;
                writeFileSync(output, buffer);
                printMeta({ path: output, size: buffer.length, model: opts.model });
            } catch (error) {
                exitWithError(error);
            }
        });
}
