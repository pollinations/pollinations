import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Command } from "commander";
import { exitWithError, fetchGen } from "../../lib/errors.js";
import { fail, getOutputMode, printInfo, printMeta } from "../../lib/output.js";

// The response's Content-Type, not the model name, decides the file
// extension: nvidia/asset-harvester returns PLY, everything else GLB.
const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
    "model/ply": "ply",
};

export function createModel3dCommand() {
    return new Command("3d")
        .description("Generate a 3D model from a prompt and/or image")
        .argument("[prompt]", "3D model description (optional with --image)")
        .option(
            "--model <model>",
            "3D model (default: microsoft/trellis-2 with --image, hyper3d/rodin-2.5 for text-only)",
        )
        .option(
            "--resolution <res>",
            "low/medium/high (microsoft/trellis-2 only)",
        )
        .option("--seed <n>", "Seed for varied generations")
        .option(
            "--image <url...>",
            "Reference image URL(s) for image-to-3D (repeatable)",
        )
        .option("--output <path>", "Save to file (extension inferred)")
        .action(async (promptArg, opts) => {
            const isHuman = getOutputMode() === "human";
            const images: string[] = opts.image ?? [];
            const badImage = images.find((u) => !/^https?:\/\//i.test(u));
            if (badImage) {
                fail(
                    `--image requires a public http(s) URL, not a local path: ${badImage}`,
                );
            }
            if (!promptArg && images.length === 0) {
                fail("Provide a prompt, --image, or both.");
            }

            // microsoft/trellis-2 is image-to-3D only (rejects a bare
            // prompt); hyper3d/rodin-2.5 is the only model that also takes
            // a text-only prompt, so the default follows --image.
            const model =
                opts.model ??
                (images.length ? "microsoft/trellis-2" : "hyper3d/rodin-2.5");

            const params = new URLSearchParams({ model });
            if (opts.resolution) params.set("resolution", opts.resolution);
            if (opts.seed) params.set("seed", opts.seed);
            if (images.length) params.set("image", images.join("|"));

            const encodedPrompt = encodeURIComponent(promptArg || "model");
            const path = `/3d/${encodedPrompt}?${params}`;

            // Before the paid request, so a bad --output folder costs nothing.
            if (opts.output)
                mkdirSync(dirname(opts.output), { recursive: true });
            if (isHuman)
                printInfo("Generating 3D model (this can take a while)...");

            try {
                const res = await fetchGen(path);
                const contentType = (res.headers.get("content-type") ?? "")
                    .split(";")[0]
                    .trim()
                    .toLowerCase();
                const extension =
                    EXTENSION_BY_CONTENT_TYPE[contentType] ?? "glb";
                const output = opts.output ?? `model.${extension}`;

                const buffer = Buffer.from(await res.arrayBuffer());
                writeFileSync(output, buffer);
                printMeta({
                    path: output,
                    size: buffer.length,
                    model,
                });
            } catch (error) {
                exitWithError(error);
            }
        });
}
