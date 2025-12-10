#!/usr/bin/env node
/**
 * R2 to AWS Glacier Deep Archive Transfer Script (Streaming)
 *
 * Streams objects from R2 and batches them into archives as they come.
 * R2 returns objects ALPHABETICALLY by key - no date sorting.
 *
 * With 2+ billion objects, we:
 * 1. Stream objects (don't load all into memory)
 * 2. Batch by count (e.g., every 50k objects = 1 archive)
 * 3. Save progress for resume capability
 *
 * Usage:
 *   node r2-to-glacier-streaming.js --bucket pollinations-images
 */

import {
    S3Client,
    ListObjectsV2Command,
    GetObjectCommand,
    PutObjectCommand,
} from "@aws-sdk/client-s3";
import {
    createWriteStream,
    createReadStream,
    unlinkSync,
    mkdirSync,
    existsSync,
    writeFileSync,
    readFileSync,
} from "fs";
import archiver from "archiver";
import { parseArgs } from "util";

const { values: args } = parseArgs({
    options: {
        bucket: { type: "string", short: "b" },
        "dry-run": { type: "boolean", default: false },
        "batch-size": { type: "string", default: "50000" },
        "aws-bucket": { type: "string", default: "pollinations-archive" },
        "resume": { type: "boolean", default: false },
        "prefix": { type: "string", default: "" },
        "start-after": { type: "string" },
        "max-batches": { type: "string" },
        "concurrency": { type: "string", default: "20" },
        help: { type: "boolean", short: "h" },
    },
});

if (args.help || !args.bucket) {
    console.log(`
R2 to AWS Glacier Deep Archive Transfer (Streaming)

Objects are returned ALPHABETICALLY by key - we batch by count as they stream.

Usage:
  node r2-to-glacier-streaming.js --bucket <bucket> [options]

Options:
  -b, --bucket        R2 source bucket (required)
  --dry-run           Count objects, estimate costs, don't transfer
  --batch-size        Objects per archive (default: 50000)
  --aws-bucket        AWS destination bucket (default: pollinations-archive)
  --resume            Resume from saved checkpoint
  --prefix            Only keys starting with prefix
  --start-after       Start after this key (manual resume)
  --max-batches       Stop after N batches (for testing)
  --concurrency       Parallel downloads per batch (default: 20)
  -h, --help          Show help

Examples:
  # Count objects and estimate costs
  node r2-to-glacier-streaming.js -b pollinations-images --dry-run

  # Transfer everything
  node r2-to-glacier-streaming.js -b pollinations-images

  # Resume after interruption
  node r2-to-glacier-streaming.js -b pollinations-images --resume
`);
    process.exit(0);
}

// Clients
const r2 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

// AWS client - uses default credential chain (env vars, ~/.aws/credentials, IAM role)
const aws = new S3Client({
    region: process.env.AWS_REGION || "us-east-1",
});

const BATCH_SIZE = parseInt(args["batch-size"]);
const TEMP_DIR = "/tmp/r2-glacier";
const CHECKPOINT_FILE = `/tmp/r2-glacier-${args.bucket}-checkpoint.json`;

if (!existsSync(TEMP_DIR)) mkdirSync(TEMP_DIR, { recursive: true });

// Save checkpoint for resume
function saveCheckpoint(lastKey, batchNum, totalObjects, totalSize) {
    writeFileSync(
        CHECKPOINT_FILE,
        JSON.stringify({
            lastKey,
            batchNum,
            totalObjects,
            totalSize,
            timestamp: new Date().toISOString(),
        }),
    );
}

// Load checkpoint
function loadCheckpoint() {
    if (existsSync(CHECKPOINT_FILE)) {
        return JSON.parse(readFileSync(CHECKPOINT_FILE, "utf8"));
    }
    return null;
}

// Download single object from R2 with retry
async function downloadObject(key, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await r2.send(
                new GetObjectCommand({ Bucket: args.bucket, Key: key }),
            );
            return response.Body;
        } catch (err) {
            if (i === retries - 1) throw err;
            await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
        }
    }
}

// Parallel download with concurrency limit
async function downloadBatch(objects, concurrency = 20) {
    const results = new Map();
    let completed = 0;
    let failed = 0;

    const downloadOne = async (obj) => {
        try {
            const chunks = [];
            const stream = await downloadObject(obj.Key);
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            results.set(obj.Key, Buffer.concat(chunks));
            completed++;
        } catch (err) {
            failed++;
            console.error(`\n   ⚠️ Failed: ${obj.Key}: ${err.message}`);
        }
        process.stdout.write(
            `\r   Downloaded: ${completed}/${objects.length} (${failed} failed)`,
        );
    };

    // Process in chunks of `concurrency`
    for (let i = 0; i < objects.length; i += concurrency) {
        const chunk = objects.slice(i, i + concurrency);
        await Promise.all(chunk.map(downloadOne));
    }

    console.log();
    return results;
}

const CONCURRENCY = parseInt(args.concurrency);

// Create archive and upload to Glacier
async function uploadBatch(objects, batchNum) {
    const archiveName = `${args.bucket}_batch_${String(batchNum).padStart(6, "0")}.tar.gz`;
    const archivePath = `${TEMP_DIR}/${archiveName}`;

    console.log(`\n📦 Batch ${batchNum}: ${objects.length} objects`);
    console.log(`   First: ${objects[0]?.Key?.substring(0, 60)}...`);

    // Download all objects in parallel
    console.log(`   ⬇️ Downloading (${CONCURRENCY} parallel)...`);
    const downloadedData = await downloadBatch(objects, CONCURRENCY);

    // Create archive from downloaded data
    console.log(`   📦 Creating archive...`);
    const output = createWriteStream(archivePath);
    // Use max gzip compression (level 9) to save space
    const archive = archiver("tar", { gzip: true, gzipOptions: { level: 9 } });
    archive.pipe(output);

    let archivedCount = 0;
    let archivedSize = 0;

    for (const obj of objects) {
        const data = downloadedData.get(obj.Key);
        if (data) {
            archive.append(data, { name: obj.Key });
            archivedCount++;
            archivedSize += data.length;
        }
    }

    await archive.finalize();
    await new Promise((resolve) => output.on("close", resolve));

    console.log(
        `   ✅ Archive: ${archivedCount} objects, ${(archivedSize / 1024 / 1024).toFixed(1)} MB`,
    );

    // Upload to Glacier Deep Archive
    console.log(`   ⬆️ Uploading to Glacier Deep Archive...`);
    const fileStream = createReadStream(archivePath);

    await aws.send(
        new PutObjectCommand({
            Bucket: args["aws-bucket"],
            Key: `${args.bucket}/${archiveName}`,
            Body: fileStream,
            StorageClass: "DEEP_ARCHIVE",
            Metadata: {
                "source-bucket": args.bucket,
                "object-count": String(archivedCount),
                "first-key": objects[0]?.Key || "",
                "last-key": objects[objects.length - 1]?.Key || "",
            },
        }),
    );

    // Cleanup - delete temp archive file
    unlinkSync(archivePath);
    console.log(
        `   ✅ Uploaded to s3://${args["aws-bucket"]}/${args.bucket}/${archiveName}`,
    );

    // Clear downloaded data from memory
    downloadedData.clear();

    return { count: archivedCount, size: archivedSize };
}

// Main transfer function
async function transfer() {
    const isDryRun = args["dry-run"];
    let startAfter = args["start-after"] || undefined;
    let batchNum = 0;
    let totalObjects = 0;
    let totalSize = 0;

    // Resume from checkpoint
    if (args.resume) {
        const checkpoint = loadCheckpoint();
        if (checkpoint) {
            console.log(`📂 Resuming from checkpoint:`);
            console.log(`   Last key: ${checkpoint.lastKey}`);
            console.log(`   Batches completed: ${checkpoint.batchNum}`);
            console.log(
                `   Objects processed: ${checkpoint.totalObjects.toLocaleString()}`,
            );
            startAfter = checkpoint.lastKey;
            batchNum = checkpoint.batchNum;
            totalObjects = checkpoint.totalObjects;
            totalSize = checkpoint.totalSize;
        }
    }

    console.log(`\n🚀 R2 → Glacier Transfer`);
    console.log(`   Source: ${args.bucket}`);
    console.log(`   Destination: ${args["aws-bucket"]} (Glacier Deep Archive)`);
    console.log(
        `   Batch size: ${BATCH_SIZE.toLocaleString()} objects/archive`,
    );
    console.log(`   Mode: ${isDryRun ? "🔍 DRY RUN" : "📤 LIVE TRANSFER"}`);
    if (args.prefix) console.log(`   Prefix filter: ${args.prefix}`);
    if (startAfter) console.log(`   Starting after: ${startAfter}`);

    let batch = [];
    let continuationToken = undefined;
    let listingCount = 0;

    console.log(`\n📋 Streaming objects...`);

    do {
        // List objects page by page
        const response = await r2.send(
            new ListObjectsV2Command({
                Bucket: args.bucket,
                MaxKeys: 1000,
                ContinuationToken: continuationToken,
                Prefix: args.prefix || undefined,
                StartAfter: startAfter,
            }),
        );

        for (const obj of response.Contents || []) {
            batch.push(obj);
            listingCount++;
            totalSize += obj.Size;

            // Progress indicator
            if (listingCount % 10000 === 0) {
                process.stdout.write(
                    `\r   Listed: ${listingCount.toLocaleString()} objects (${(totalSize / 1024 / 1024 / 1024).toFixed(2)} GB)`,
                );
            }

            // Batch is full - process it
            if (batch.length >= BATCH_SIZE) {
                batchNum++;
                totalObjects += batch.length;

                if (!isDryRun) {
                    await uploadBatch(batch, batchNum);
                    saveCheckpoint(
                        batch[batch.length - 1].Key,
                        batchNum,
                        totalObjects,
                        totalSize,
                    );
                } else {
                    console.log(
                        `\n   [DRY RUN] Would create batch ${batchNum}: ${batch.length} objects`,
                    );
                }

                batch = [];

                // Check max batches limit
                if (
                    args["max-batches"] &&
                    batchNum >= parseInt(args["max-batches"])
                ) {
                    console.log(
                        `\n⏹️ Stopped after ${batchNum} batches (--max-batches)`,
                    );
                    return;
                }
            }
        }

        continuationToken = response.NextContinuationToken;

        // Clear startAfter after first page (continuation token takes over)
        startAfter = undefined;
    } while (continuationToken);

    // Handle remaining objects
    if (batch.length > 0) {
        batchNum++;
        totalObjects += batch.length;

        if (!isDryRun) {
            await uploadBatch(batch, batchNum);
            saveCheckpoint(
                batch[batch.length - 1].Key,
                batchNum,
                totalObjects,
                totalSize,
            );
        } else {
            console.log(
                `\n   [DRY RUN] Would create final batch ${batchNum}: ${batch.length} objects`,
            );
        }
    }

    // Summary
    const totalGB = totalSize / 1024 / 1024 / 1024;
    const totalTB = totalGB / 1024;
    const putCost = (batchNum * 0.005) / 1000;
    const monthlyStorage = totalTB * 0.99; // $0.00099/GB = $0.99/TB

    console.log(
        `\n\n🎉 ${isDryRun ? "DRY RUN COMPLETE" : "TRANSFER COMPLETE"}!`,
    );
    console.log(`   Total objects: ${totalObjects.toLocaleString()}`);
    console.log(
        `   Total size: ${totalGB.toFixed(2)} GB (${totalTB.toFixed(2)} TB)`,
    );
    console.log(`   Archives created: ${batchNum}`);
    console.log(`\n💰 Cost Estimate:`);
    console.log(`   PUT requests: $${putCost.toFixed(4)}`);
    console.log(
        `   Monthly storage (Glacier Deep Archive): $${monthlyStorage.toFixed(2)}/month`,
    );

    if (isDryRun) {
        console.log(`\n✅ Remove --dry-run to execute transfer.`);
    }
}

// Run
transfer().catch((err) => {
    console.error("\n❌ Transfer failed:", err);
    process.exit(1);
});
