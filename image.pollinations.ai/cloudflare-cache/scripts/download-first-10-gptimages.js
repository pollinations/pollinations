#!/usr/bin/env node

/**
 * Download sampled gptimage files (every 20th) directly from R2 using API credentials
 * Usage: CLOUDFLARE_ACCOUNT_ID=xxx CLOUDFLARE_AUTH_TOKEN=xxx node download-first-10-gptimages.js
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const R2_PUBLIC_URL = "https://pub-eea51b91cb774097a086f7170d7c837c.r2.dev";
const KEYS_FILE = "gptimage_keys.txt";
const OUTPUT_DIR = "./downloads/sampled-gptimages";
const SAMPLE_INTERVAL = 10; // Download every 20th image

/**
 * Read and sample keys from the gptimage_keys.txt file (every Nth key)
 */
function readSampledKeys(interval = SAMPLE_INTERVAL) {
	if (!existsSync(KEYS_FILE)) {
		console.error(`❌ Keys file not found: ${KEYS_FILE}`);
		console.log(
			"💡 Make sure to run this script from the directory containing the keys file",
		);
		process.exit(1);
	}

	const content = readFileSync(KEYS_FILE, "utf8");
	const allKeys = content
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0);

	// Sample every Nth key (0-indexed, so we start from index interval-1)
	const sampledKeys = [];
	for (let i = interval - 1; i < allKeys.length; i += interval) {
		sampledKeys.push(allKeys[i]);
	}

	console.log(
		`📋 Found ${allKeys.length} total keys, sampling every ${interval}th key (${sampledKeys.length} selected)`,
	);
	return sampledKeys;
}

/**
 * Ensure output directory exists
 */
function ensureOutputDir() {
	if (!existsSync(OUTPUT_DIR)) {
		mkdirSync(OUTPUT_DIR, { recursive: true });
		console.log(`📁 Created directory: ${OUTPUT_DIR}`);
	}
}

/**
 * Sanitize filename for filesystem compatibility
 */
function sanitizeFilename(key) {
	return key.replace(/[<>:"/\\|?*%]/g, "_").substring(0, 200);
}

/**
 * Download a single object from R2
 */
async function downloadObject(key, index) {
	const sanitizedKey = sanitizeFilename(key);
	const filename = `${String(index + 1).padStart(2, "0")}_${sanitizedKey}.jpg`;
	const filepath = join(OUTPUT_DIR, filename);

	// Skip if already exists
	if (existsSync(filepath)) {
		console.log(`⏭️  [${index + 1}] Skipping (exists): ${filename}`);
		return { key, status: "skipped", filename };
	}

	try {
		console.log(
			`📥 [${index + 1}] Downloading: ${sanitizedKey.substring(0, 60)}...`,
		);

		// Use the public R2 dev URL to download the object
		const url = `${R2_PUBLIC_URL}/${encodeURIComponent(key)}`;

		const response = await fetch(url);

		if (!response.ok) {
			if (response.status === 404) {
				console.log(`🚫 [${index + 1}] Not found: ${sanitizedKey}`);
				return { key, status: "not_found", filename };
			}
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		// Get the image data
		const imageBuffer = Buffer.from(await response.arrayBuffer());

		if (imageBuffer.length === 0) {
			console.log(`❌ [${index + 1}] Empty response: ${sanitizedKey}`);
			return { key, status: "empty", filename };
		}

		// Save the image
		writeFileSync(filepath, imageBuffer);

		// Save metadata
		const metadataPath = join(OUTPUT_DIR, `${filename}.json`);
		const metadata = {
			originalKey: key,
			filename: filename,
			size: imageBuffer.length,
			downloadedAt: new Date().toISOString(),
			contentType: response.headers.get("content-type") || "image/jpeg",
			etag: response.headers.get("etag") || null,
		};
		writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

		const sizeMB = (imageBuffer.length / 1024 / 1024).toFixed(2);
		console.log(`✅ [${index + 1}] Saved: ${filename} (${sizeMB} MB)`);

		return { key, status: "success", filename, size: imageBuffer.length };
	} catch (error) {
		console.error(
			`❌ [${index + 1}] Error downloading ${sanitizedKey}: ${error.message}`,
		);
		return { key, status: "error", filename, error: error.message };
	}
}

/**
 * Main function
 */
async function main() {
	console.log("🖼️  GPTImage Public R2 Downloader (Sampled Files)\n");
	console.log(`🌐 Using public R2 URL: ${R2_PUBLIC_URL}`);
	console.log(`📊 Sampling every ${SAMPLE_INTERVAL}th image\n`);

	try {
		ensureOutputDir();
		const keys = readSampledKeys(SAMPLE_INTERVAL);

		if (keys.length === 0) {
			console.log("No keys found to process.");
			return;
		}

		console.log(`🚀 Starting download of ${keys.length} images...\n`);

		const results = {
			success: 0,
			skipped: 0,
			notFound: 0,
			errors: 0,
			total: keys.length,
		};

		// Download files sequentially to be gentle on the API
		for (let i = 0; i < keys.length; i++) {
			const result = await downloadObject(keys[i], i);

			// Update results
			switch (result.status) {
				case "success":
					results.success++;
					break;
				case "skipped":
					results.skipped++;
					break;
				case "not_found":
					results.notFound++;
					break;
				default:
					results.errors++;
					break;
			}

			// Small delay between downloads
			if (i < keys.length - 1) {
				await new Promise((resolve) => setTimeout(resolve, 500));
			}
		}

		// Final summary
		console.log("\n" + "=".repeat(50));
		console.log("📋 DOWNLOAD SUMMARY");
		console.log("=".repeat(50));
		console.log(`✅ Successful downloads: ${results.success}`);
		console.log(`⏭️  Skipped (already exist): ${results.skipped}`);
		console.log(`🚫 Not found: ${results.notFound}`);
		console.log(`❌ Errors: ${results.errors}`);
		console.log(`📊 Total processed: ${results.total}`);
		console.log(`📁 Files saved to: ${join(process.cwd(), OUTPUT_DIR)}`);

		if (results.success > 0) {
			console.log(`\n🎉 Successfully downloaded ${results.success} images!`);
		}

		if (results.errors > 0 || results.notFound > 0) {
			console.log("\n⚠️  Some downloads failed. This could be due to:");
			console.log("   - Network connectivity issues");
			console.log("   - Keys that no longer exist in the bucket");
			console.log("   - Public access restrictions on some objects");
		}
	} catch (error) {
		console.error("❌ Script error:", error.message);
		if (error.stack) {
			console.error(error.stack);
		}
		process.exit(1);
	}
}

// Handle Ctrl+C gracefully
process.on("SIGINT", () => {
	console.log("\n\n⏹️  Download interrupted by user");
	process.exit(0);
});

main();
