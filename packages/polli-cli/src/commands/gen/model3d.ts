import { writeFileSync } from "node:fs";
import { Command } from "commander";
import { exitWithError, fetchGen } from "../../lib/errors.js";
import {
    getOutputMode,
    printError,
    printInfo,
    printMeta,
} from "../../lib/output.js";

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
    "model/gltf-binary": "glb",
    "model/ply": "ply",
};

export function createModel3dCommand() {
    return new Command("3d")
        .description("Generate a 3D model from a prompt or reference image(s)")
        .addHelpText(
            "after",
            `\nExamples:\n  polli gen 3d "a low-poly treasure chest"\n  polli gen 3d --image https://example.com/fox.png --model microsoft/trellis-2\n`,
        )
        .argument(
            "[prompt]",
            "Text description (required unless --image is given)",
        )
        .option("--model <model>", "3D model")
        .option("--resolution <res>", "low/medium/high (microsoft/trellis-2)")
        .option("--seed <n>", "Seed for varied generations")
        .option(
            "--image <url...>",
            "Reference image URL(s) for image-to-3D (repeatable)",
        )
        .option(
            "--output <path>",
            "Save to file (extension follows the API response: .glb or .ply)",
        )
        .action(async (prompt, opts) => {
            const isHuman = getOutputMode() === "human";

            if (!prompt && !opts.image?.length) {
                printError("Provide a prompt, --image, or both.");
                process.exit(1);
                return;
            }

            const params = new URLSearchParams();
            if (opts.model) params.set("model", opts.model);
            if (opts.resolution) params.set("resolution", opts.resolution);
            if (opts.seed) params.set("seed", opts.seed);
            if (opts.image?.length) {
                const bad = opts.image.find(
                    (u: string) => !/^https?:\/\//i.test(u),
                );
                if (bad) {
                    printError(
                        `--image requires a public http(s) URL, not a local path: ${bad}`,
                    );
                    process.exit(1);
                    return;
                }
                params.set("image", opts.image.join("|"));
            }

            const encodedPrompt = encodeURIComponent(
                prompt || "reference image",
            );
            const query = params.toString();
            const path = `/3d/${encodedPrompt}${query ? `?${query}` : ""}`;

            if (isHuman)
                printInfo("Generating 3D model (this can take a while)...");

            try {
                const res = await fetchGen(path);

                const buffer = Buffer.from(await res.arrayBuffer());
                const contentType = res.headers
                    .get("content-type")
                    ?.split(";")[0]
                    .trim();
                const ext =
                    EXTENSION_BY_CONTENT_TYPE[contentType ?? ""] ?? "glb";
                const output = opts.output ?? `model.${ext}`;
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
