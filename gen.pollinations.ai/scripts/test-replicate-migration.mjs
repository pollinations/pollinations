/**
 * Direct integration test for the BytePlus → Replicate migration.
 *
 * Bypasses the gen worker + auth and invokes Replicate directly with the same
 * inputs our new handlers send. Chained scenarios:
 *   1. seedream5 T2I produces a seed image
 *   2. seedream5 I2I edits the seed image (verifies image-to-image)
 *   3. seedance T2V (standalone)
 *   4. seedance I2V animates the seed image (verifies image-to-video)
 *   5. seedance-pro T2V (standalone)
 *   6. seedance-pro I2V animates the seed image
 *
 * Usage:
 *   node scripts/test-replicate-migration.mjs
 *
 * Requires REPLICATE_API_TOKEN in .dev.vars or env.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(SCRIPT_DIR, "..", ".replicate-test-output");
mkdirSync(OUT_DIR, { recursive: true });

function loadToken() {
    if (process.env.REPLICATE_API_TOKEN) return process.env.REPLICATE_API_TOKEN;
    const devVars = readFileSync(join(SCRIPT_DIR, "..", ".dev.vars"), "utf8");
    const match = devVars.match(/^REPLICATE_API_TOKEN="([^"]+)"/m);
    if (!match) throw new Error("REPLICATE_API_TOKEN not found in .dev.vars");
    return match[1];
}

const TOKEN = loadToken();

async function runPrediction({ model, input }) {
    const url = `https://api.replicate.com/v1/models/${model}/predictions`;
    const resp = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            "Content-Type": "application/json",
            Prefer: "wait=60",
        },
        body: JSON.stringify({ input }),
    });
    if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Replicate ${resp.status}: ${text.slice(0, 400)}`);
    }
    let pred = await resp.json();
    // Cap polling at 60 attempts (5 min) so a stuck prediction can't hang
    // the test indefinitely. No extra spend — Replicate bills on prediction
    // creation, not per poll.
    let polls = 0;
    while (pred.status === "starting" || pred.status === "processing") {
        if (polls >= 60) {
            throw new Error(`Prediction ${pred.id} stuck (${pred.status}) after 5 min`);
        }
        await new Promise((r) => setTimeout(r, 5000));
        const pollResp = await fetch(
            pred.urls?.get || `https://api.replicate.com/v1/predictions/${pred.id}`,
            { headers: { Authorization: `Bearer ${TOKEN}` } },
        );
        pred = await pollResp.json();
        polls++;
    }
    if (pred.status !== "succeeded") {
        throw new Error(
            `Prediction ${pred.status}: ${pred.error || "no error message"}`,
        );
    }
    return pred;
}

async function downloadToFile(url, filename) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
    const buf = Buffer.from(await resp.arrayBuffer());
    const path = join(OUT_DIR, filename);
    writeFileSync(path, buf);
    return { path, sizeKB: (buf.length / 1024).toFixed(1), url };
}

// Shared state: the seed image URL gets produced by Test 1 and consumed by
// Test 2 / 4 / 6. Replicate accepts its own delivery URLs as input directly
// — no need to re-upload as data URIs in this script.
let seedImageUrl = null;

const tests = [
    {
        name: "seedream5: text-to-image — generates seed image",
        run: async () => {
            const pred = await runPrediction({
                model: "bytedance/seedream-5-lite",
                input: {
                    prompt:
                        "A bright red apple sitting on an old wooden kitchen table, soft window light, photographic",
                    size: "2K",
                    aspect_ratio: "1:1",
                    image_input: [],
                    output_format: "png",
                    sequential_image_generation: "disabled",
                    max_images: 1,
                    seed: 42,
                },
            });
            const url = Array.isArray(pred.output) ? pred.output[0] : pred.output;
            seedImageUrl = url;
            const file = await downloadToFile(url, "1-seedream5-t2i.png");
            return `output=${file.sizeKB}KB predict_time=${pred.metrics?.predict_time?.toFixed(1) || "?"}s url=${url.slice(0, 60)}...`;
        },
    },
    {
        name: "seedream5: image-to-image — edits the seed image (add a green leaf)",
        run: async () => {
            if (!seedImageUrl) throw new Error("No seed image from Test 1");
            const pred = await runPrediction({
                model: "bytedance/seedream-5-lite",
                input: {
                    prompt:
                        "Add a small green leaf to the apple's stem. Keep the table and lighting identical.",
                    size: "2K",
                    aspect_ratio: "match_input_image",
                    image_input: [seedImageUrl],
                    output_format: "png",
                    sequential_image_generation: "disabled",
                    max_images: 1,
                },
            });
            const url = Array.isArray(pred.output) ? pred.output[0] : pred.output;
            const file = await downloadToFile(url, "2-seedream5-i2i.png");
            return `output=${file.sizeKB}KB predict_time=${pred.metrics?.predict_time?.toFixed(1) || "?"}s`;
        },
    },
    {
        name: "seedance (Lite): text-to-video 720p",
        run: async () => {
            const pred = await runPrediction({
                model: "bytedance/seedance-1-lite",
                input: {
                    prompt: "Aerial shot of waves crashing on a rocky coast",
                    duration: 5,
                    resolution: "720p",
                    aspect_ratio: "16:9",
                    fps: 24,
                    camera_fixed: false,
                },
            });
            const file = await downloadToFile(pred.output, "3-seedance-t2v.mp4");
            return `output=${file.sizeKB}KB duration=${pred.metrics?.video_output_duration_seconds || "?"}s`;
        },
    },
    {
        name: "seedance (Lite): image-to-video — animates the seed image (camera dolly in)",
        run: async () => {
            if (!seedImageUrl) throw new Error("No seed image from Test 1");
            const pred = await runPrediction({
                model: "bytedance/seedance-1-lite",
                input: {
                    prompt: "slow camera dolly in toward the apple, table stays still",
                    image: seedImageUrl,
                    duration: 5,
                    resolution: "720p",
                    fps: 24,
                    camera_fixed: false,
                },
            });
            const file = await downloadToFile(pred.output, "4-seedance-i2v.mp4");
            return `output=${file.sizeKB}KB duration=${pred.metrics?.video_output_duration_seconds || "?"}s`;
        },
    },
    {
        name: "seedance-pro: text-to-video 720p",
        run: async () => {
            const pred = await runPrediction({
                model: "bytedance/seedance-1-pro-fast",
                input: {
                    prompt: "Cinematic timelapse of a forest at sunrise",
                    duration: 5,
                    resolution: "720p",
                    aspect_ratio: "16:9",
                    fps: 24,
                    camera_fixed: false,
                },
            });
            const file = await downloadToFile(pred.output, "5-seedance-pro-t2v.mp4");
            return `output=${file.sizeKB}KB duration=${pred.metrics?.video_output_duration_seconds || "?"}s`;
        },
    },
    {
        name: "seedance-pro: image-to-video — animates the seed image (slow rotation)",
        run: async () => {
            if (!seedImageUrl) throw new Error("No seed image from Test 1");
            const pred = await runPrediction({
                model: "bytedance/seedance-1-pro-fast",
                input: {
                    prompt: "the apple slowly rotates in place on the table, gentle lighting shift",
                    image: seedImageUrl,
                    duration: 5,
                    resolution: "720p",
                    fps: 24,
                    camera_fixed: false,
                },
            });
            const file = await downloadToFile(pred.output, "6-seedance-pro-i2v.mp4");
            return `output=${file.sizeKB}KB duration=${pred.metrics?.video_output_duration_seconds || "?"}s`;
        },
    },
];

console.log(`\nReplicate migration test — ${tests.length} chained scenarios`);
console.log(`Output dir: ${OUT_DIR}\n`);
const results = [];
for (const t of tests) {
    const start = Date.now();
    try {
        const detail = await t.run();
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`  ✓ ${t.name}  [${elapsed}s]  ${detail}`);
        results.push({ name: t.name, ok: true });
    } catch (err) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`  ✗ ${t.name}  [${elapsed}s]  ${err.message?.slice(0, 200)}`);
        results.push({ name: t.name, ok: false });
    }
}
const passed = results.filter((r) => r.ok).length;
console.log(`\n${passed} / ${tests.length} passed`);
process.exit(passed === tests.length ? 0 : 1);
