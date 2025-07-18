#!/usr/bin/env node

/**
 * Download input images using curl for better reliability
 */

import { readFileSync, existsSync, mkdirSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { dirname } from "path";

const execAsync = promisify(exec);
const EXTRACTED_URLS_FILE = "./extracted_image_urls.json";
const OUTPUT_DIR = "./image_analysis";

async function downloadWithCurl(url, filepath) {
	// Ensure directory exists
	const dir = dirname(filepath);
	if (!existsSync(dir)) {
		console.log(`   📁 Creating directory: ${dir}`);
		mkdirSync(dir, { recursive: true });
	}

	if (existsSync(filepath)) {
		console.log(`   ⏭️  Already exists: ${filepath}`);
		return true;
	}

	console.log(`   📥 Downloading: ${url}`);

	try {
		// Enhanced curl command with browser-like headers
		const curlCommand = [
			"curl",
			"-L", // Follow redirects
			"--max-redirs 10", // Limit redirects
			"--retry 3", // Retry on failure
			"--retry-delay 1", // Delay between retries
			"--connect-timeout 30", // Connection timeout
			"--max-time 60", // Overall timeout
			'-H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"',
			'-H "Accept: image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"',
			'-H "Accept-Language: en-US,en;q=0.9"',
			'-H "Accept-Encoding: gzip, deflate, br"',
			'-H "DNT: 1"',
			'-H "Connection: keep-alive"',
			'-H "Upgrade-Insecure-Requests: 1"',
			url.includes("catbox.moe") ? '-H "Referer: https://catbox.moe/"' : "",
			"-o",
			`"${filepath}"`,
			`"${url}"`,
		]
			.filter(Boolean)
			.join(" ");

		const { stdout, stderr } = await execAsync(curlCommand);

		// Check if file was created and has content
		if (existsSync(filepath)) {
			const stats = await import("fs").then((fs) => fs.promises.stat(filepath));
			if (stats.size > 0) {
				console.log(`   ✅ Downloaded: ${Math.round(stats.size / 1024)}KB`);
				return true;
			} else {
				console.log(`   ❌ Empty file: ${url}`);
				// Remove empty file
				try {
					await import("fs").then((fs) => fs.promises.unlink(filepath));
				} catch {}
				return false;
			}
		} else {
			console.log(`   ❌ Failed to create file: ${url}`);
			return false;
		}
	} catch (error) {
		console.log(`   ❌ Error downloading ${url}: ${error.message}`);
		// Clean up any partial file
		if (existsSync(filepath)) {
			try {
				await import("fs").then((fs) => fs.promises.unlink(filepath));
			} catch {}
		}
		return false;
	}
}

async function main() {
	console.log("📥 Downloading input images with curl...\n");

	if (!existsSync(EXTRACTED_URLS_FILE)) {
		console.error(`❌ File not found: ${EXTRACTED_URLS_FILE}`);
		process.exit(1);
	}

	const data = JSON.parse(readFileSync(EXTRACTED_URLS_FILE, "utf8"));
	const results = data.results || [];

	let totalSuccessful = 0;
	let totalAttempted = 0;

	for (let i = 0; i < results.length; i++) {
		const item = results[i];
		const generationNumber = String(i + 1).padStart(3, "0");

		console.log(
			`\n📁 Generation ${generationNumber}: ${item.imageUrls.length} input(s)`,
		);

		for (let j = 0; j < item.imageUrls.length; j++) {
			const url = item.imageUrls[j];
			const urlExtension = url.split(".").pop().split("?")[0] || "jpg";
			const inputFilename = `input_${String(j + 1).padStart(3, "0")}.${urlExtension}`;
			const filepath = `${OUTPUT_DIR}/generation_${generationNumber}/${inputFilename}`;

			totalAttempted++;
			const success = await downloadWithCurl(url, filepath);
			if (success) totalSuccessful++;

			// Longer delay between downloads to avoid rate limiting
			await new Promise((resolve) => setTimeout(resolve, 2000));
		}
	}

	console.log("\n" + "=".repeat(50));
	console.log("📊 DOWNLOAD SUMMARY");
	console.log("=".repeat(50));
	console.log(`📥 Total attempted: ${totalAttempted}`);
	console.log(`✅ Successfully downloaded: ${totalSuccessful}`);
	console.log(`❌ Failed: ${totalAttempted - totalSuccessful}`);
	console.log(
		`📈 Success rate: ${Math.round((totalSuccessful / totalAttempted) * 100)}%`,
	);
}

main().catch(console.error);
