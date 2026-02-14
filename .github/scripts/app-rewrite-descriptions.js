#!/usr/bin/env node

/**
 * AI-rewrite truncated app descriptions using Pollinations API (batched).
 *
 * Reads the JSON output from app-fetch-descriptions.js, batches ~10 apps per
 * API call, rewrites descriptions, validates, and writes back to APPS.md.
 *
 * Usage: node .github/scripts/app-rewrite-descriptions.js [options]
 *   --dry-run    Show rewrites without modifying APPS.md
 *   --verbose    Show detailed output
 *
 * Reads: apps/descriptions-to-fix.json  (from app-fetch-descriptions.js)
 * Writes: apps/APPS.md                  (updated descriptions)
 *
 * Env vars:
 *   POLLINATIONS_API_KEY   Optional — API key for Pollinations (required if auth is enforced)
 */

const fs = require("fs");
const https = require("https");
const path = require("path");

const APPS_FILE = "apps/APPS.md";
const INPUT_FILE = "apps/descriptions-to-fix.json";
const PROMPT_FILE = path.join(__dirname, "app-description-prompt.txt");
const POLLINATIONS_API = "gen.pollinations.ai";
const MODEL = "openai";
const BATCH_SIZE = 10;

const colors = {
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    reset: "\x1b[0m",
    bold: "\x1b[1m",
};

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const verbose = args.includes("--verbose");

/**
 * Call Pollinations API with a chat completion request.
 */
function callPollinationsAPI(systemPrompt, userMessage) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            model: MODEL,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage },
            ],
            temperature: 0.3,
        });

        const headers = {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload),
        };

        if (process.env.POLLINATIONS_API_KEY) {
            headers["Authorization"] =
                `Bearer ${process.env.POLLINATIONS_API_KEY}`;
        }

        const options = {
            hostname: POLLINATIONS_API,
            path: "/v1/chat/completions",
            method: "POST",
            headers,
        };

        const req = https.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => {
                data += chunk;
            });
            res.on("end", () => {
                if (res.statusCode === 200) {
                    try {
                        const json = JSON.parse(data);
                        const content =
                            json.choices?.[0]?.message?.content || "";
                        resolve(content);
                    } catch {
                        reject(new Error("Failed to parse API response"));
                    }
                } else {
                    reject(
                        new Error(
                            `API returned status ${res.statusCode}: ${data.substring(0, 200)}`,
                        ),
                    );
                }
            });
        });

        req.on("error", (err) => reject(err));
        req.setTimeout(60000, () => {
            req.destroy();
            reject(new Error("API timeout"));
        });

        req.write(payload);
        req.end();
    });
}

/**
 * Build user message for a batch of apps.
 */
function buildBatchMessage(batch) {
    const lines = batch.map(
        (app, i) =>
            `${i + 1}. App: "${app.name}" — Original: "${app.original}"`,
    );

    return `Rewrite these app descriptions. Return a JSON array with objects containing "name" and "description" fields.

${lines.join("\n")}

Return ONLY valid JSON like: [{"name": "AppName", "description": "rewritten..."}]`;
}

/**
 * Parse the AI response into an array of {name, description} objects.
 */
function parseAIResponse(content) {
    // Extract JSON from response (may be wrapped in markdown code block)
    let jsonStr = content.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) {
        throw new Error("Response is not a JSON array");
    }

    return parsed;
}

/**
 * Validate a rewritten description.
 */
function validateDescription(desc) {
    if (!desc || typeof desc !== "string")
        return { valid: false, reason: "empty or not a string" };
    if (desc.length > 200)
        return { valid: false, reason: `too long (${desc.length} chars)` };
    if (desc.length < 10)
        return { valid: false, reason: `too short (${desc.length} chars)` };
    if (desc.includes("|"))
        return { valid: false, reason: "contains pipe character" };
    if (desc.includes("\n"))
        return { valid: false, reason: "contains newline" };
    return { valid: true };
}

async function main() {
    console.log(`${colors.bold}✍️  App Description Rewriter${colors.reset}\n`);

    if (dryRun) {
        console.log(
            `${colors.yellow}[DRY RUN] APPS.md will not be modified${colors.reset}\n`,
        );
    }

    // Read inputs
    if (!fs.existsSync(INPUT_FILE)) {
        console.error(
            `${colors.red}Error: ${INPUT_FILE} not found. Run app-fetch-descriptions.js first.${colors.reset}`,
        );
        process.exit(1);
    }

    if (!fs.existsSync(PROMPT_FILE)) {
        console.error(
            `${colors.red}Error: ${PROMPT_FILE} not found.${colors.reset}`,
        );
        process.exit(1);
    }

    const apps = JSON.parse(fs.readFileSync(INPUT_FILE, "utf8"));
    const systemPrompt = fs.readFileSync(PROMPT_FILE, "utf8").trim();

    console.log(`Loaded ${apps.length} apps to rewrite`);
    console.log(
        `Batch size: ${BATCH_SIZE} → ${Math.ceil(apps.length / BATCH_SIZE)} API calls\n`,
    );

    // Read APPS.md for later writing
    const appsContent = fs.readFileSync(APPS_FILE, "utf8");
    const lines = appsContent.split("\n");

    // Find description column index
    const headerIdx = lines.findIndex((l) => l.startsWith("| Emoji"));
    const headers = lines[headerIdx].split("|").map((h) => h.trim());
    const DESC_COL = headers.findIndex(
        (h) => h.toLowerCase() === "description",
    );

    const stats = { rewritten: 0, skipped: 0, errors: 0 };
    const changes = [];

    // Process in batches
    const batches = [];
    for (let i = 0; i < apps.length; i += BATCH_SIZE) {
        batches.push(apps.slice(i, i + BATCH_SIZE));
    }

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
        const batch = batches[batchIdx];
        console.log(
            `${colors.cyan}Batch ${batchIdx + 1}/${batches.length} (${batch.length} apps)...${colors.reset}`,
        );

        try {
            const userMessage = buildBatchMessage(batch);
            const response = await callPollinationsAPI(
                systemPrompt,
                userMessage,
            );

            if (verbose) {
                console.log(`  Raw response: ${response.substring(0, 200)}...`);
            }

            const results = parseAIResponse(response);

            // Match results back to apps by name
            for (const app of batch) {
                const result = results.find(
                    (r) => r.name.toLowerCase() === app.name.toLowerCase(),
                );

                if (!result) {
                    console.log(
                        `${colors.yellow}  ⚠ No result for "${app.name}"${colors.reset}`,
                    );
                    stats.skipped++;
                    continue;
                }

                const { valid, reason } = validateDescription(
                    result.description,
                );
                if (!valid) {
                    console.log(
                        `${colors.yellow}  ⚠ Invalid for "${app.name}": ${reason}${colors.reset}`,
                    );
                    stats.skipped++;
                    continue;
                }

                if (verbose) {
                    console.log(
                        `${colors.green}  ✓ ${app.name}: "${result.description}"${colors.reset}`,
                    );
                }

                changes.push({
                    lineIdx: app.lineIdx,
                    name: app.name,
                    oldDesc: app.current,
                    newDesc: result.description,
                });
                stats.rewritten++;
            }
        } catch (err) {
            console.log(
                `${colors.red}  ✗ Batch ${batchIdx + 1} failed: ${err.message}${colors.reset}`,
            );
            stats.errors += batch.length;
        }

        // Small delay between batches
        if (batchIdx < batches.length - 1) {
            await new Promise((r) => setTimeout(r, 500));
        }
    }

    // Apply changes to APPS.md
    if (!dryRun && changes.length > 0) {
        for (const change of changes) {
            const cols = lines[change.lineIdx].split("|");
            cols[DESC_COL] = ` ${change.newDesc} `;
            lines[change.lineIdx] = cols.join("|");
        }

        fs.writeFileSync(APPS_FILE, lines.join("\n"));
        console.log(
            `\n${colors.green}✅ Updated ${changes.length} descriptions in ${APPS_FILE}${colors.reset}`,
        );
    }

    // Summary
    console.log(`\n${colors.bold}📊 Summary${colors.reset}`);
    console.log(
        `${colors.green}✓ Rewritten: ${stats.rewritten}${colors.reset}`,
    );
    console.log(`${colors.yellow}⚠ Skipped: ${stats.skipped}${colors.reset}`);
    console.log(`${colors.red}✗ Errors: ${stats.errors}${colors.reset}`);

    if (dryRun && changes.length > 0) {
        console.log(
            `\n${colors.cyan}[DRY RUN] Would update these descriptions:${colors.reset}`,
        );
        for (const c of changes) {
            console.log(`  ${c.name}:`);
            console.log(`    ${colors.red}- ${c.oldDesc}${colors.reset}`);
            console.log(`    ${colors.green}+ ${c.newDesc}${colors.reset}`);
        }
    }

    return 0;
}

main()
    .then((code) => process.exit(code))
    .catch((err) => {
        console.error(
            `${colors.red}Fatal error: ${err.message}${colors.reset}`,
        );
        process.exit(1);
    });
