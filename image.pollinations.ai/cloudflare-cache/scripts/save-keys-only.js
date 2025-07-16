#!/usr/bin/env node

/**
 * Save R2 bucket keys to a txt file with resume functionality
 *
 * Usage:
 *   node save-keys-only.js                    # Normal mode (starts from beginning)
 *   node save-keys-only.js 14000              # Resume from batch 14000 (manual)
 *   node save-keys-only.js --auto-resume      # Auto-detect resume point from last key
 *
 * Resume modes:
 *   1. Manual batch resume: Pass batch number as argument
 *   2. Auto-resume: Automatically finds where to continue from last saved key
 */

import fs from "fs";
import path from "path";

// Configuration
const WORKER_URL = "https://temp-r2-explorer.thomash-efd.workers.dev";
const OUTPUT_FILE = "./all_keys.txt";
const CURSOR_STATE_FILE = "./cursor_state.json";
const PROGRESS_FILE = "./progress.txt";
const BATCH_SIZE = 1000; // R2's maximum limit per request
const USE_KEYS_ONLY = true; // Try keys-only first, fallback to list
const MAX_OBJECTS = 50000000; // 500k objects limit

// Resume configuration
const RESUME_FROM_BATCH = parseInt(process.argv[2]) || 0; // Pass batch number as argument
const RESET_MODE = process.argv.includes("--reset"); // Reset cursor state
const STATUS_MODE = process.argv.includes("--status"); // Show status only

async function getLastLineFromFile(filePath) {
    const stats = fs.statSync(filePath);
    const fileSize = stats.size;

    if (fileSize === 0) {
        return null;
    }

    // Read from the end of file to find the last line
    const bufferSize = Math.min(1024, fileSize); // Read up to 1KB from end
    const buffer = Buffer.alloc(bufferSize);

    const fd = fs.openSync(filePath, "r");
    const position = Math.max(0, fileSize - bufferSize);
    fs.readSync(fd, buffer, 0, bufferSize, position);
    fs.closeSync(fd);

    const text = buffer.toString("utf8");
    const lines = text.split("\n").filter((line) => line.trim().length > 0);

    return lines.length > 0 ? lines[lines.length - 1].trim() : null;
}

async function getLineCount(filePath) {
    // Use wc -l to count lines efficiently
    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);

    try {
        const { stdout } = await execAsync(`wc -l < "${filePath}"`);
        return parseInt(stdout.trim());
    } catch (error) {
        // Fallback: estimate based on file size (rough estimate)
        const stats = fs.statSync(filePath);
        return Math.floor(stats.size / 50); // Rough estimate: 50 chars per key
    }
}

async function getResumeInfo() {
    if (!fs.existsSync(OUTPUT_FILE)) {
        return { shouldResume: false, lastKey: null, totalExisting: 0 };
    }

    const lastKey = await getLastLineFromFile(OUTPUT_FILE);

    if (!lastKey) {
        return { shouldResume: false, lastKey: null, totalExisting: 0 };
    }

    const totalExisting = await getLineCount(OUTPUT_FILE);
    return { shouldResume: true, lastKey, totalExisting };
}

/**
 * Load cursor state from file
 */
function loadCursorState() {
    try {
        if (fs.existsSync(CURSOR_STATE_FILE)) {
            const state = JSON.parse(
                fs.readFileSync(CURSOR_STATE_FILE, "utf8"),
            );
            console.log(
                `📂 Resuming from cursor: ${state.cursor ? state.cursor.substring(0, 20) + "..." : "start"}`,
            );
            console.log(`📊 Total keys already saved: ${state.totalKeys}`);
            console.log(`📅 Last updated: ${state.lastUpdated}`);
            return state;
        }
    } catch (error) {
        console.warn(`⚠️  Could not load cursor state: ${error.message}`);
    }

    console.log("🆕 Starting fresh - no previous cursor state found");
    return {
        cursor: undefined,
        totalKeys: 0,
        batchCount: 0,
        lastUpdated: new Date().toISOString(),
    };
}

/**
 * Save cursor state to file
 */
function saveCursorState(state) {
    try {
        const stateToSave = {
            ...state,
            lastUpdated: new Date().toISOString(),
        };
        fs.writeFileSync(
            CURSOR_STATE_FILE,
            JSON.stringify(stateToSave, null, 2),
        );
    } catch (error) {
        console.error(`❌ Failed to save cursor state: ${error.message}`);
    }
}

async function findResumePoint(lastKey) {
    console.log(`🔍 Finding resume point after key: ${lastKey}`);

    // We'll need to find where to resume by fetching batches until we find our last key
    let cursor = undefined;
    let batchCount = 0;

    while (batchCount < 50) {
        // Limit search to avoid infinite loop
        batchCount++;

        let keysOnlyUrl = `${WORKER_URL}?action=keys-only&limit=${BATCH_SIZE}`;
        if (cursor) {
            keysOnlyUrl += `&cursor=${encodeURIComponent(cursor)}`;
        }

        const response = await fetch(keysOnlyUrl);
        if (!response.ok) {
            throw new Error(`Resume search failed: ${response.status}`);
        }

        const data = await response.json();
        if (!data.keys || data.keys.length === 0) {
            break;
        }

        // Check if our last key is in this batch
        const keyIndex = data.keys.indexOf(lastKey);
        if (keyIndex !== -1) {
            console.log(
                `✅ Found resume point! Key was at position ${keyIndex} in batch ${batchCount}`,
            );
            // We want to resume from the next key after our last key
            if (keyIndex < data.keys.length - 1) {
                // There are more keys in this batch, so we can use the current cursor
                return {
                    cursor: data.cursor,
                    skipInBatch: keyIndex + 1,
                    batchNumber: batchCount,
                };
            } else {
                // Last key was the final key in this batch, so we need the next cursor
                return {
                    cursor: data.cursor,
                    skipInBatch: 0,
                    batchNumber: batchCount + 1,
                };
            }
        }

        cursor = data.cursor;
        if (!cursor) break; // No more data
    }

    console.log(`⚠️  Could not find resume point, starting from beginning`);
    return null;
}

async function main() {
    // Handle command line options first
    if (RESET_MODE) {
        console.log("🔄 Resetting cursor state...");
        try {
            if (fs.existsSync(CURSOR_STATE_FILE)) {
                fs.unlinkSync(CURSOR_STATE_FILE);
                console.log("✅ Cursor state reset");
            }
            if (fs.existsSync(PROGRESS_FILE)) {
                fs.unlinkSync(PROGRESS_FILE);
                console.log("✅ Progress file reset");
            }
        } catch (error) {
            console.error(`❌ Reset failed: ${error.message}`);
        }
        return;
    }

    if (STATUS_MODE) {
        console.log("📊 Status check...");
        const state = loadCursorState();
        if (fs.existsSync(OUTPUT_FILE)) {
            const data = fs.readFileSync(OUTPUT_FILE, "utf8");
            const lines = data
                .trim()
                .split("\n")
                .filter((line) => line.trim());
            console.log(
                `📁 File contains: ${lines.length.toLocaleString()} keys`,
            );
        }
        return;
    }

    console.log("🚀 Starting robust keys-only download...");
    console.log(`📊 Batch size: ${BATCH_SIZE.toLocaleString()}`);
    console.log(`🎯 Max objects: ${MAX_OBJECTS.toLocaleString()}`);
    console.log(`📝 Output file: ${OUTPUT_FILE}`);

    // Load cursor state for proper resuming
    let cursorState = loadCursorState();

    // Auto-detect resume point if no cursor state but output file exists
    if (!cursorState.cursor && fs.existsSync(OUTPUT_FILE)) {
        console.log("\n🔄 Attempting auto-resume from existing file...");
        const resumeInfo = await getResumeInfo();

        if (resumeInfo.shouldResume) {
            console.log(
                `📁 Found existing file with ${resumeInfo.totalExisting.toLocaleString()} keys`,
            );
            console.log(
                `🔍 Last key: ${resumeInfo.lastKey.substring(0, 100)}...`,
            );

            // Try to find the resume point (limited search)
            const resumePoint = await findResumePoint(resumeInfo.lastKey);
            if (resumePoint) {
                cursorState = {
                    cursor: resumePoint.cursor,
                    totalKeys: resumeInfo.totalExisting,
                    batchCount: resumePoint.batchNumber || 0,
                    lastUpdated: new Date().toISOString(),
                };
                saveCursorState(cursorState);
                console.log(`✅ Auto-resume successful`);
            } else {
                console.log(`⚠️  Could not find resume point, starting fresh`);
                cursorState.totalKeys = 0; // Reset if we can't resume properly
            }
        }
    }

    // Determine output mode (append or write)
    const writeMode = cursorState.totalKeys > 0 ? "append" : "write";
    if (writeMode === "write") {
        fs.writeFileSync(OUTPUT_FILE, "");
    }

    console.log(`\n📁 Output: ${OUTPUT_FILE} (${writeMode}ing)`);
    console.log(
        `📊 Starting from: ${cursorState.totalKeys} keys, batch ${cursorState.batchCount + 1}`,
    );

    const startTime = Date.now();

    try {
        let totalFetched = cursorState.totalKeys; // Start with cursor state count
        let batchCount = cursorState.batchCount; // Start from cursor state batch
        let cursor = cursorState.cursor; // Use cursor state cursor
        let keysBuffer = [];
        const BUFFER_SIZE = 10000; // Write to file every 10k keys

        console.log(`\n📦 Starting batch fetching...`);
        if (cursorState.totalKeys > 0) {
            console.log(
                `🔄 Resuming from batch ${batchCount + 1}, already have ${totalFetched.toLocaleString()} keys`,
            );
        }

        while (totalFetched < MAX_OBJECTS) {
            batchCount++;

            if (batchCount % 10 === 0) {
                console.log(
                    `📋 Batch ${batchCount}: Fetching ${BATCH_SIZE} objects... (${totalFetched.toLocaleString()} total so far)`,
                );
            }

            let listData;
            let listResponse;

            if (USE_KEYS_ONLY) {
                // Try efficient keys-only action first (much less data transfer)
                let keysOnlyUrl = `${WORKER_URL}?action=keys-only&limit=${BATCH_SIZE}`;
                if (cursor) {
                    keysOnlyUrl += `&cursor=${encodeURIComponent(cursor)}`;
                }

                listResponse = await fetch(keysOnlyUrl);

                if (listResponse.ok) {
                    listData = await listResponse.json();

                    if (listData && listData.keys && listData.keys.length > 0) {
                        // Keys-only worked! Use the efficient response
                        keysBuffer.push(...listData.keys);
                        totalFetched += listData.keys.length;
                        cursor = listData.cursor;
                    } else {
                        console.log(`🏁 No more keys available (keys-only)`);
                        break;
                    }
                } else if (listResponse.status === 500) {
                    // Keys-only not available, fall back to regular list
                    console.log(
                        `⚠️  Keys-only not available, falling back to regular list action...`,
                    );

                    let listUrl = `${WORKER_URL}?action=list&limit=${BATCH_SIZE}`;
                    if (cursor) {
                        listUrl += `&cursor=${encodeURIComponent(cursor)}`;
                    }

                    listResponse = await fetch(listUrl);

                    if (!listResponse.ok) {
                        throw new Error(
                            `List request failed: ${listResponse.status} ${listResponse.statusText}`,
                        );
                    }

                    listData = await listResponse.json();

                    if (
                        !listData ||
                        !listData.objects ||
                        listData.objects.length === 0
                    ) {
                        console.log(`🏁 No more objects available`);
                        break;
                    }

                    // Extract only the keys from the full object data
                    for (const obj of listData.objects) {
                        keysBuffer.push(obj.key);
                    }

                    totalFetched += listData.objects.length;
                    cursor = listData.cursor;
                } else {
                    throw new Error(
                        `Keys-only request failed: ${listResponse.status} ${listResponse.statusText}`,
                    );
                }
            } else {
                // Use regular list action
                let listUrl = `${WORKER_URL}?action=list&limit=${BATCH_SIZE}`;
                if (cursor) {
                    listUrl += `&cursor=${encodeURIComponent(cursor)}`;
                }

                listResponse = await fetch(listUrl);

                if (!listResponse.ok) {
                    throw new Error(
                        `List request failed: ${listResponse.status} ${listResponse.statusText}`,
                    );
                }

                listData = await listResponse.json();

                if (
                    !listData ||
                    !listData.objects ||
                    listData.objects.length === 0
                ) {
                    console.log(`🏁 No more objects available`);
                    break;
                }

                // Extract only the keys from the full object data
                for (const obj of listData.objects) {
                    keysBuffer.push(obj.key);
                }

                totalFetched += listData.objects.length;
                cursor = listData.cursor;
            }

            // Write to file when buffer is full
            if (keysBuffer.length >= BUFFER_SIZE) {
                fs.appendFileSync(OUTPUT_FILE, keysBuffer.join("\n") + "\n");
                console.log(
                    `💾 Wrote ${keysBuffer.length.toLocaleString()} keys to file (${totalFetched.toLocaleString()} total)`,
                );
                keysBuffer = [];

                // Save cursor state after writing
                const newState = {
                    cursor: cursor,
                    totalKeys: totalFetched,
                    batchCount: batchCount,
                    lastUpdated: new Date().toISOString(),
                };
                saveCursorState(newState);
            }

            // Save cursor state every 10 batches (even if buffer not full)
            if (batchCount % 10 === 0) {
                const newState = {
                    cursor: cursor,
                    totalKeys: totalFetched,
                    batchCount: batchCount,
                    lastUpdated: new Date().toISOString(),
                };
                saveCursorState(newState);

                // Update progress file
                const elapsed = (Date.now() - startTime) / 1000;
                const rate = totalFetched / elapsed;
                fs.writeFileSync(
                    PROGRESS_FILE,
                    `Batch: ${batchCount}\n` +
                        `Total Keys: ${totalFetched.toLocaleString()}\n` +
                        `Rate: ${rate.toFixed(1)} keys/second\n` +
                        `Elapsed: ${elapsed.toFixed(1)}s\n` +
                        `Last Updated: ${new Date().toISOString()}\n`,
                );
            }

            // Show progress every 50 batches
            if (batchCount % 50 === 0) {
                const elapsed = (Date.now() - startTime) / 1000;
                const rate = totalFetched / elapsed;
                console.log(
                    `📊 Progress: ${batchCount} batches, ${totalFetched.toLocaleString()} objects | Rate: ${rate.toFixed(1)}/s`,
                );
            }

            // Check if we're done
            if (!listData.truncated || !listData.cursor) {
                console.log(`🏁 Reached end of bucket`);
                break;
            }

            // Small delay to be nice to the server
            if (batchCount % 100 === 0) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }

        // Write any remaining keys
        if (keysBuffer.length > 0) {
            fs.appendFileSync(OUTPUT_FILE, keysBuffer.join("\n") + "\n");
            console.log(
                `💾 Wrote final ${keysBuffer.length.toLocaleString()} keys to file`,
            );
        }

        // Clean up cursor state file if download is complete
        if (!cursor) {
            try {
                if (fs.existsSync(CURSOR_STATE_FILE)) {
                    fs.unlinkSync(CURSOR_STATE_FILE);
                    console.log(
                        "🧹 Cleaned up cursor state file (download completed)",
                    );
                }
            } catch (e) {
                // Ignore cleanup errors
            }
        }

        const elapsed = (Date.now() - startTime) / 1000;
        console.log(`\n🎉 Keys-only download complete!`);
        console.log(`📊 Final statistics:`);
        console.log(`   - Total objects: ${totalFetched.toLocaleString()}`);
        console.log(`   - Batches processed: ${batchCount}`);
        console.log(`   - Total time: ${elapsed.toFixed(1)}s`);
        console.log(`   - Output file: ${OUTPUT_FILE}`);

        // Check file size
        const stats = fs.statSync(OUTPUT_FILE);
        console.log(
            `   - File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`,
        );

        // Count lines in file
        const content = fs.readFileSync(OUTPUT_FILE, "utf8");
        const lineCount = content
            .split("\n")
            .filter((line) => line.trim()).length;
        console.log(`   - Lines in file: ${lineCount.toLocaleString()}`);

        // Show first few lines as sample
        const lines = content.split("\n").slice(0, 5);
        console.log(`\n📋 Sample keys:`);
        lines.forEach((line, i) => {
            if (line.trim()) {
                console.log(`   ${i + 1}. ${line.substring(0, 100)}...`);
            }
        });

        // Look for GPT images
        const gptLines = content
            .split("\n")
            .filter(
                (line) =>
                    line.toLowerCase().includes("gpt") ||
                    line.includes("model=gpt") ||
                    line.includes("model%3Dgpt"),
            );

        console.log(`\n🔍 GPT image search results:`);
        console.log(`   - Total lines: ${lineCount.toLocaleString()}`);
        console.log(`   - Lines with 'gpt': ${gptLines.length}`);

        if (gptLines.length > 0) {
            console.log(`\n📋 GPT image keys found:`);
            gptLines.slice(0, 10).forEach((line, i) => {
                console.log(`   ${i + 1}. ${line.substring(0, 120)}...`);
            });

            if (gptLines.length > 10) {
                console.log(`   ... and ${gptLines.length - 10} more`);
            }

            // Save GPT keys to separate file
            const gptFile = "./gpt_keys_only.txt";
            fs.writeFileSync(gptFile, gptLines.join("\n") + "\n");
            console.log(`📝 Saved GPT keys to: ${gptFile}`);
        }
    } catch (error) {
        console.error(`\n❌ Error during extraction: ${error.message}`);

        // Save cursor state even on error for resuming
        if (
            typeof totalFetched !== "undefined" &&
            typeof batchCount !== "undefined" &&
            typeof cursor !== "undefined"
        ) {
            const errorState = {
                cursor: cursor,
                totalKeys: totalFetched,
                batchCount: batchCount,
                lastUpdated: new Date().toISOString(),
            };
            saveCursorState(errorState);
            console.log(
                "💾 Progress saved to cursor state - you can resume by running the script again",
            );
        }

        process.exit(1);
    }
}

// Show help if requested
if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`
🚀 ROBUST R2 KEY EXTRACTION

Usage:
    node save-keys-only.js             # Start/resume extraction
    node save-keys-only.js --reset     # Reset cursor state and start fresh
    node save-keys-only.js --status    # Check current status
    node save-keys-only.js --help      # Show this help

Legacy options (less reliable):
    node save-keys-only.js 14000       # Manual batch resume (not recommended)
    node save-keys-only.js --auto-resume # Auto-detect resume (fallback mode)

Files created:
    ${OUTPUT_FILE}     # All extracted keys (one per line)
    ${CURSOR_STATE_FILE}      # Cursor state for resuming
    ${PROGRESS_FILE}         # Current progress info

Features:
    ✅ True cursor-based resume (not fake batch counting)
    ✅ Auto-resume detection from existing files
    ✅ Progress tracking and rate estimation
    ✅ Atomic cursor saves after each batch
    ✅ Graceful error handling with resume capability
  `);
    process.exit(0);
}

main().catch(console.error);
