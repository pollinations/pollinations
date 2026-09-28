import { writeFileSync } from "node:fs";
import { Command } from "commander";
import { exitWithError, fetchGen } from "../../lib/errors.js";
import { numberOption } from "../../lib/number-option.js";
import {
    getOutputMode,
    printError,
    printInfo,
    printMeta,
} from "../../lib/output.js";

export function create3dCommand() {
    return new Command("3d")
        .description(
            "Generate a 3D model (GLB, or PLY from nvidia/asset-harvester). Discover models: polli models --type 3d",
        )
        .addHelpText(
            "after",
            `\nExamples:\n  polli gen 3d "a red fox"\n  polli gen 3d --image https://media.pollinations.ai/abc --output model.glb\n  polli gen 3d "a treasure chest" --resolution medium --output chest.glb\n`,
        )
        .argument(
            "[prompt]",
            "Model description (ignored by image-only models)",
        )
        .option("--model <model>", "3D model", "microsoft/trellis-2")
        .option(
            "--resolution <res>",
            "Output detail: low/medium/high (trellis-2)",
        )
        .option("--seed <n>", "Seed for varied generations")
        .option(
            "--image <url...>",
            "Reference image URL(s) for image-to-3D (repeatable)",
        )
        .option(
            "--output <path>",
            "Save to file (default: model.glb or model.ply)",
        )
        .action(async (prompt, opts) => {
            const isHuman = getOutputMode() === "human";

            const params = new URLSearchParams({ model: opts.model });
            if (opts.resolution) params.set("resolution", opts.resolution);
            if (opts.seed !== undefined)
                params.set(
                    "seed",
                    String(
                        numberOption("--seed", opts.seed, 0, 4294967295, true),
                    ),
                );
            if (opts.image?.length) {
                const bad = opts.image.find(
                    (u: string) => !/^https?:\/\//i.test(u),
                );
                if (bad) {
                    printError(
                        `--image requires a public http(s) URL, not a local path: ${bad}`,
                    );
                    process.exit(1);
                }
                params.set("image", opts.image.join("|"));
            }

            // The prompt is optional for image-only models but the path
            // parameter is required; the server ignores it for those models.
            const encodedPrompt = encodeURIComponent(prompt ?? "-");
            const path = `/3d/${encodedPrompt}?${params}`;

            if (isHuman)
                printInfo("Generating 3D model (this can take a while)...");

            try {
                const res = await fetchGen(path);

                const buffer = Buffer.from(await res.arrayBuffer());
                const contentType = res.headers.get("content-type") ?? "";
                const extension = contentType.includes("ply") ? "ply" : "glb";
                const output = opts.output ?? `model.${extension}`;
                writeFileSync(output, buffer);

                printMeta({
                    path: output,
                    size: buffer.length,
                    model: opts.model,
                });
            } catch (error) {
                exitWithError(error);
            }
        });
}
