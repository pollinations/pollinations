import { writeFileSync } from "node:fs";
import { Command } from "commander";
import ora from "ora";
import { BASE_URL, resolveModel } from "../lib/config.js";
import { requireKey } from "../lib/api.js";
import {
	getOutputMode,
	printError,
	printResult,
} from "../lib/output.js";

export const editCommand = new Command("edit")
	.description("Edit images using AI — supports up to 14 input images")
	.argument("<prompt>", "Describe the edit to apply")
	.requiredOption("--image <url...>", "Input image URL(s) — repeat for multiple (max 14)")
	.option("--model <model>", "Image model (default: gptimage)")
	.option("--size <WxH>", "Output dimensions: 1024x1024 / 1792x1024 / 1024x1792")
	.option("--quality <level>", "low / medium / high / hd")
	.option("--seed <n>", "Random seed")
	.option("--output <path>", "Save result to file (default: edited.png)")
	.action(async (prompt, opts) => {
		const key = requireKey();
		const model = resolveModel("image", opts.model ?? "gptimage");
		const isHuman = getOutputMode() === "human";
		const images: string[] = opts.image;
		const outputPath: string = opts.output ?? "edited.png";

		if (images.length > 14) {
			printError("Maximum 14 input images supported");
			process.exit(1);
		}

		const spinner = isHuman ? ora(`Editing image with ${images.length} input(s)...`).start() : null;

		try {
			const body: Record<string, unknown> = {
				prompt,
				model,
				image: images.length === 1
					? images[0]
					: images.map((url) => ({ image_url: url })),
			};
			if (opts.size) body.size = opts.size;
			if (opts.quality) body.quality = opts.quality;
			if (opts.seed) body.seed = Number(opts.seed);

			const res = await fetch(`${BASE_URL}/v1/images/edits`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${key}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(body),
				signal: AbortSignal.timeout(120_000),
			});

			if (!res.ok) {
				const text = await res.text().catch(() => "");
				throw new Error(`${res.status} ${res.statusText}: ${text}`);
			}

			const json = await res.json() as { data?: { b64_json?: string; revised_prompt?: string }[] };
			const item = json.data?.[0];
			if (!item?.b64_json) throw new Error("No image data in response");

			const buffer = Buffer.from(item.b64_json, "base64");
			writeFileSync(outputPath, buffer);
			spinner?.succeed(`Saved to ${outputPath}`);

			printResult({
				path: outputPath,
				model,
				inputs: images.length,
				size: buffer.length,
				...(item.revised_prompt ? { revised_prompt: item.revised_prompt } : {}),
			});
		} catch (err) {
			spinner?.fail("Edit failed");
			printError(err instanceof Error ? err.message : "unknown error");
			process.exit(1);
		}
	});
