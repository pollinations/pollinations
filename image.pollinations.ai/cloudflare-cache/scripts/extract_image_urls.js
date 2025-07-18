#!/usr/bin/env node

/**
 * Extract image URLs from the originalKey field in JSON metadata files
 */

import { readFileSync } from "fs";
import { join } from "path";

const DOWNLOADS_DIR = "./downloads/sampled-gptimages";
const IMAGE_FILES_LIST = "./image_to_image_files.txt";

function extractImageUrls(originalKey) {
    // Pattern to match image URLs after "_image_" or "image_"
    // The URL is URL-encoded, so we need to handle %2F, %3A, etc.
    const patterns = [
        // Pattern 1: _image_https%3A%2F%2F... (most common)
        /_image_https%3A%2F%2F([^&_]+)/g,
        // Pattern 2: image_https%3A%2F%2F...
        /image_https%3A%2F%2F([^&_]+)/g,
        // Pattern 3: _image_http%3A%2F%2F...
        /_image_http%3A%2F%2F([^&_]+)/g,
        // Pattern 4: image_http%3A%2F%2F...
        /image_http%3A%2F%2F([^&_]+)/g,
        // Pattern 5: Just in case there are unencoded URLs
        /_image_(https?:\/\/[^&_]+)/g,
        /image_(https?:\/\/[^&_]+)/g,
    ];

    const urls = [];

    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(originalKey)) !== null) {
            let url = match[1];

            // If it starts with https or http, it's already decoded
            if (url.startsWith("http")) {
                // Check for comma-separated URLs
                const splitUrls = url
                    .split(",")
                    .map((u) => u.trim())
                    .filter((u) => u);
                urls.push(...splitUrls);
            } else {
                // Decode the URL-encoded string
                try {
                    const decodedUrl = "https://" + decodeURIComponent(url);
                    // Check for comma-separated URLs after decoding
                    const splitUrls = decodedUrl
                        .split(",")
                        .map((u) => u.trim())
                        .filter((u) => u);
                    urls.push(...splitUrls);
                } catch (error) {
                    // If decoding fails, try with the raw match
                    const fallbackUrl = "https://" + url;
                    const splitUrls = fallbackUrl
                        .split(",")
                        .map((u) => u.trim())
                        .filter((u) => u);
                    urls.push(...splitUrls);
                }
            }
        }
    }

    return [...new Set(urls)]; // Remove duplicates
}

async function main() {
    console.log("🔗 Extracting image URLs from originalKey fields...\n");

    // Read the list of image-to-image files
    const imageFiles = readFileSync(IMAGE_FILES_LIST, "utf8")
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => line.trim());

    console.log(`📂 Processing ${imageFiles.length} image-to-image files\n`);

    const results = [];

    for (const imageFile of imageFiles) {
        const jsonFile = imageFile.replace(".jpg", ".jpg.json");
        const jsonPath = join(DOWNLOADS_DIR, jsonFile);

        try {
            const content = readFileSync(jsonPath, "utf8");
            const metadata = JSON.parse(content);
            const originalKey = metadata.originalKey || "";

            const urls = extractImageUrls(originalKey);

            if (urls.length > 0) {
                results.push({
                    file: imageFile,
                    originalKey: originalKey,
                    imageUrls: urls,
                });

                console.log(`✅ ${imageFile}`);
                urls.forEach((url, index) => {
                    console.log(`   📷 ${index + 1}: ${url}`);
                });
                console.log("");
            } else {
                console.log(`❌ No URLs found in: ${imageFile}`);
                console.log(`   Key: ${originalKey.substring(0, 100)}...`);
                console.log("");
            }
        } catch (error) {
            console.error(`❌ Error processing ${jsonFile}: ${error.message}`);
        }
    }

    console.log("\n📊 SUMMARY:");
    console.log("=".repeat(50));
    console.log(`📁 Files processed: ${imageFiles.length}`);
    console.log(`🔗 Files with URLs found: ${results.length}`);
    console.log(
        `📷 Total unique URLs extracted: ${results.reduce((sum, r) => sum + r.imageUrls.length, 0)}`,
    );

    // Save results to file
    const outputData = {
        extractedAt: new Date().toISOString(),
        totalFiles: imageFiles.length,
        filesWithUrls: results.length,
        results: results,
    };

    import("fs").then((fs) => {
        fs.writeFileSync(
            "./extracted_image_urls.json",
            JSON.stringify(outputData, null, 2),
        );
        console.log(`\n💾 Results saved to: ./extracted_image_urls.json`);
    });

    // Also save just the URLs as a simple list
    const allUrls = results.flatMap((r) => r.imageUrls);
    const uniqueUrls = [...new Set(allUrls)];

    import("fs").then((fs) => {
        fs.writeFileSync("./image_urls_list.txt", uniqueUrls.join("\n"));
        console.log(`💾 URL list saved to: ./image_urls_list.txt`);
        console.log(`🔗 ${uniqueUrls.length} unique URLs total`);
    });
}

main().catch(console.error);
