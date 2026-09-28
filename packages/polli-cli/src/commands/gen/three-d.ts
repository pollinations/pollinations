import { writeFileSync } from "node:fs";
import { Command } from "commander";
import { exitWithError, fetchGen } from "../../lib/errors.js";
import { getOutputMode, printInfo, printMeta } from "../../lib/output.js";

/** nvidia/asset-harvester answers with a PLY mesh; everyone else with GLB. */
const extensionFor = (contentType: string | null, model: string) => {
    const type = (contentType ?? "").toLowerCase();
    if (type.includes("ply")) return "ply";
    if (type.includes("gltf-binary") || type.includes("octet-stream"))
        return "glb";
    return model.includes("asset-harvester") ? "ply" : "glb";
};

export function create3dCommand() {
    return new Command("3d")
        .description("Generate a 3D model from a prompt")
        .argument("<prompt>", "3D object description")
        .option("--model <model>", "3D model")
        .option("--resolution <n>", "Mesh resolution")
        .option("--seed <n>", "Random seed")
        .option(
            "--image <url...>",
            "Reference image URL(s) for image-to-3D (repeatable)",
        )
        .option(
            "--output <path>",
            "Save to file (extension defaults to the returned format)",
        )
        .addHelpText(
            "after",
            `\nExamples:\n  polli gen 3d "a red fox"\n  polli gen 3d "a red fox" --image https://example.com/fox.png --output fox.glb\n`,
        )
        .action(async (prompt, opts) => {
            const isHuman = getOutputMode() === "human";

            const params = new URLSearchParams();
            if (opts.model) params.set("model", opts.model);
            if (opts.resolution) params.set("resolution", opts.resolution);
            if (opts.seed) params.set("seed", opts.seed);
            if (opts.image?.length) {
                const bad = opts.image.find(
                    (url: string) => !/^https?:\/\//i.test(url),
                );
                if (bad) {
                    return exitWithError(
                        new Error(
                            `--image requires a public http(s) URL, not a local path: ${bad}. Use polli upload first.`,
                        ),
                    );
                }
                params.set("image", opts.image.join("|"));
            }

            const query = params.toString();
            const path = `/3d/${encodeURIComponent(prompt)}${query ? `?${query}` : ""}`;

            if (isHuman) printInfo("Generating 3D model...");

            try {
                const res = await fetchGen(path);
                const buffer = Buffer.from(await res.arrayBuffer());
                const model =
                    opts.model ?? res.headers.get("x-model") ?? "default";
                const output =
                    opts.output ??
                    `model.${extensionFor(res.headers.get("content-type"), model)}`;

                writeFileSync(output, buffer);
                printMeta({ path: output, size: buffer.length, model });
            } catch (error) {
                exitWithError(error);
            }
        });
}
