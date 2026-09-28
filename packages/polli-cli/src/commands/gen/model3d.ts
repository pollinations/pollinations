import { writeFileSync } from "node:fs";
import { Command } from "commander";
import { exitWithError, fetchGen } from "../../lib/errors.js";
import { getOutputMode, printInfo, printMeta } from "../../lib/output.js";

export function create3dCommand() {
    return new Command("3d")
        .description("Generate a 3D model (GLB) from a prompt or image")
        .argument("<prompt>", "Object description")
        .option("--model <model>", "3D model (see /3d/models)")
        .option("--image <url>", "Reference image URL(s), comma-separated")
        .option("--resolution <level>", "low/medium/high (trellis-2 only)")
        .option("--seed <n>", "Random seed")
        .option("--output <path>", "Save to file", "model.glb")
        .action(async (prompt, opts) => {
            const params = new URLSearchParams();
            if (opts.model) params.set("model", opts.model);
            if (opts.image) params.set("image", opts.image);
            if (opts.resolution) params.set("resolution", opts.resolution);
            if (opts.seed) params.set("seed", opts.seed);

            if (getOutputMode() === "human")
                printInfo("Generating 3D model (this can take a few minutes)...");

            try {
                const res = await fetchGen(
                    `/3d/${encodeURIComponent(prompt)}?${params}`,
                );
                const buffer = Buffer.from(await res.arrayBuffer());
                writeFileSync(opts.output, buffer);
                printMeta({
                    path: opts.output,
                    size: buffer.length,
                    model: opts.model,
                });
            } catch (error) {
                exitWithError(error);
            }
        });
}
