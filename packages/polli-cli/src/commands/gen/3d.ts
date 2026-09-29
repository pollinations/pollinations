import { writeFileSync } from "node:fs";
import { Command } from "commander";
import { exitWithError, fetchGen } from "../../lib/errors.js";
import {
    ExitSignal,
    getOutputMode,
    printError,
    printInfo,
    printMeta,
} from "../../lib/output.js";

const DEFAULT_MODEL = "microsoft/trellis-2";

/**
 * Image-only models ignore the prompt, but the route still needs a path
 * segment. This is the placeholder the API docs use for that case.
 */
const NO_PROMPT = "no_prompt_for_trellis_needed";

/** `nvidia/asset-harvester` returns PLY; every other model returns GLB. */
export function defaultExtension(model: string): string {
    return model === "nvidia/asset-harvester" ? "ply" : "glb";
}

/**
 * These models reconstruct a 3D asset from reference images and ignore the
 * prompt, so a prompt-only call would fail server-side with a 400.
 */
const IMAGE_ONLY_MODELS = new Set([
    "microsoft/trellis-2",
    "microsoft/trellis-2:fal",
    "nvidia/asset-harvester",
]);

export function create3dCommand() {
    return new Command("3d")
        .description(
            "Generate a 3D model from a prompt or reference image(s) (.glb, .ply from nvidia/asset-harvester)",
        )
        .addHelpText(
            "after",
            `\nExamples:\n  polli gen 3d "a red fox"\n  polli gen 3d --image https://example.com/chair.png --model nvidia/asset-harvester --output chair.ply\n`,
        )
        .argument(
            "[prompt]",
            "Text description (not needed for image-only models)",
        )
        .option("--model <model>", "3D model", DEFAULT_MODEL)
        .option("--resolution <level>", "low, medium or high (trellis-2)")
        .option("--seed <n>", "Seed for varied generations")
        .option(
            "--image <url...>",
            "Reference image URL(s) for image-to-3D (repeatable)",
        )
        .option(
            "--output <path>",
            "Save to file (default: model.glb|model.ply)",
        )
        .action(async (promptArg, opts) => {
            const isHuman = getOutputMode() === "human";

            if (!promptArg && !opts.image?.length) {
                printError(
                    "No prompt or --image URL provided. Pass a prompt, at least one --image URL, or both.",
                );
                throw new ExitSignal(1);
            }
            if (
                promptArg &&
                !opts.image?.length &&
                IMAGE_ONLY_MODELS.has(opts.model)
            ) {
                printError(
                    `--model ${opts.model} is image-to-3D only: it needs --image <url> and ignores the prompt. Pass a reference image, or use a text-to-3D model such as --model hyper3d/rodin-2.5 (see \`polli models --type 3d\`).`,
                );
                throw new ExitSignal(1);
            }
            if (opts.image?.length) {
                const bad = opts.image.find(
                    (u: string) => !/^https?:\/\//i.test(u),
                );
                if (bad) {
                    printError(
                        `--image requires a public http(s) URL, not a local path: ${bad}`,
                    );
                    throw new ExitSignal(1);
                }
            }

            const output =
                opts.output ?? `model.${defaultExtension(opts.model)}`;

            const params = new URLSearchParams({ model: opts.model });
            if (opts.resolution) params.set("resolution", opts.resolution);
            if (opts.seed) params.set("seed", opts.seed);
            if (opts.image?.length) params.set("image", opts.image.join("|"));

            const encodedPrompt = encodeURIComponent(promptArg || NO_PROMPT);
            const path = `/3d/${encodedPrompt}?${params}`;

            if (isHuman) printInfo("Generating 3D model...");

            try {
                const res = await fetchGen(path);

                const buffer = Buffer.from(await res.arrayBuffer());
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
