#!/usr/bin/env node

/**
 * Organize image-to-image generations into structured folders
 * Each generation gets its own folder with:
 * - output.jpg (generated image)
 * - input_001.jpg, input_002.jpg, etc. (reference images)
 * - metadata.json (complete originalKey and info)
 * - prompt.txt (decoded prompt text)
 */

import fs, {
	readFileSync,
	writeFileSync,
	mkdirSync,
	existsSync,
	copyFileSync,
} from "fs";
import { join, dirname, extname } from "path";
import { fileURLToPath } from "url";
import https from "https";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DOWNLOADS_DIR = "./downloads/sampled-gptimages";
const OUTPUT_DIR = "./image_analysis";
const EXTRACTED_URLS_FILE = "./extracted_image_urls.json";

async function downloadImage(url, filepath) {
	return new Promise((resolve, reject) => {
		if (existsSync(filepath)) {
			console.log(`   ⏭️  Already exists: ${filepath}`);
			resolve();
			return;
		}

		const file = fs.createWriteStream(filepath);
		console.log(`   📥 Downloading: ${url}`);

		https
			.get(url, (response) => {
				if (response.statusCode === 200) {
					response.pipe(file);
					file.on("finish", () => {
						file.close();
						console.log(`   ✅ Downloaded: ${filepath}`);
						resolve();
					});
				} else {
					file.close();
					reject(new Error(`HTTP ${response.statusCode}: ${url}`));
				}
			})
			.on("error", (err) => {
				file.close();
				reject(err);
			});
	});
}

function decodePrompt(originalKey) {
	try {
		// Extract the prompt part (remove _prompt_ prefix and everything after _image_)
		let promptPart = originalKey.replace(/^_prompt_/, "");
		promptPart = promptPart.split("_image_")[0];

		// Decode URL encoding
		const decoded = decodeURIComponent(promptPart);
		return decoded;
	} catch (error) {
		return originalKey; // Return original if decoding fails
	}
}

function sanitizeFilename(name) {
	return name
		.replace(/[<>:"/\\|?*]/g, "_")
		.replace(/\s+/g, "_")
		.substring(0, 100); // Limit length
}

async function organizeGeneration(item, index) {
	const generationNumber = String(index + 1).padStart(3, "0");
	const generationDir = join(OUTPUT_DIR, `generation_${generationNumber}`);

	console.log(`\n📁 Processing Generation ${generationNumber}:`);
	console.log(`   File: ${item.file}`);

	// Create generation directory
	mkdirSync(generationDir, { recursive: true });

	// 1. Copy the output (generated) image
	const outputImagePath = join(DOWNLOADS_DIR, item.file);
	const outputDestPath = join(generationDir, `output${extname(item.file)}`);

	if (existsSync(outputImagePath)) {
		copyFileSync(outputImagePath, outputDestPath);
		console.log(`   ✅ Copied output image: output${extname(item.file)}`);
	} else {
		console.log(`   ❌ Output image not found: ${outputImagePath}`);
	}

	// 2. Skip input image downloads - they'll be handled by download_input_images.js
	console.log(
		`   📥 Input images (${item.imageUrls.length}) will be downloaded separately`,
	);

	// 3. Save metadata
	const metadata = {
		generationNumber: generationNumber,
		originalFile: item.file,
		originalKey: item.originalKey,
		inputImageUrls: item.imageUrls,
		inputImageCount: item.imageUrls.length,
		processedAt: new Date().toISOString(),
	};

	const metadataPath = join(generationDir, "metadata.json");
	writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
	console.log(`   ✅ Saved metadata.json`);

	// 4. Save decoded prompt
	const decodedPrompt = decodePrompt(item.originalKey);
	const promptPath = join(generationDir, "prompt.txt");
	writeFileSync(promptPath, decodedPrompt);
	console.log(`   ✅ Saved prompt.txt`);
	console.log(
		`   📝 Prompt: "${decodedPrompt.substring(0, 80)}${decodedPrompt.length > 80 ? "..." : ""}"`,
	);

	return generationDir;
}

async function main() {
	console.log("🗂️  Organizing image-to-image generations...\n");

	// Read extraction results
	if (!existsSync(EXTRACTED_URLS_FILE)) {
		console.error(`❌ File not found: ${EXTRACTED_URLS_FILE}`);
		console.error("Please run extract_image_urls.js first");
		process.exit(1);
	}

	const data = JSON.parse(readFileSync(EXTRACTED_URLS_FILE, "utf8"));
	const results = data.results || [];

	console.log(`📂 Creating organized structure in: ${OUTPUT_DIR}`);
	console.log(
		`📊 Processing ${results.length} generations with input images\n`,
	);

	// Create output directory
	mkdirSync(OUTPUT_DIR, { recursive: true });

	// Process each generation
	const processedDirs = [];
	for (let i = 0; i < results.length; i++) {
		try {
			const dir = await organizeGeneration(results[i], i);
			processedDirs.push(dir);
		} catch (error) {
			console.error(
				`❌ Error processing generation ${i + 1}: ${error.message}`,
			);
		}
	}

	// Generate summary
	console.log("\n" + "=".repeat(60));
	console.log("📊 ORGANIZATION COMPLETE");
	console.log("=".repeat(60));
	console.log(`📁 Total generations organized: ${processedDirs.length}`);
	console.log(`📂 Output directory: ${OUTPUT_DIR}`);
	console.log(
		`🖼️  Total input images downloaded: ${results.reduce((sum, r) => sum + r.imageUrls.length, 0)}`,
	);

	// Create index file
	const indexData = {
		createdAt: new Date().toISOString(),
		totalGenerations: processedDirs.length,
		generationDirs: processedDirs.map((dir, i) => ({
			number: i + 1,
			path: dir,
			inputImages: results[i].imageUrls.length,
			prompt: decodePrompt(results[i].originalKey).substring(0, 100),
		})),
	};

	const indexPath = join(OUTPUT_DIR, "index.json");
	writeFileSync(indexPath, JSON.stringify(indexData, null, 2));
	console.log(`📄 Index created: ${indexPath}`);

	console.log("\n🎉 Ready for analysis! Each generation has:");
	console.log("   • output.jpg - The generated image");
	console.log("   • input_001.jpg, input_002.jpg... - Reference images");
	console.log("   • metadata.json - Complete technical data");
	console.log("   • prompt.txt - Human-readable prompt");
}

main().catch(console.error);
