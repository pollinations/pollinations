#!/usr/bin/env node

/**
 * Fetch original app descriptions from GitHub issues for apps with truncated descriptions.
 *
 * Parses APPS.md, finds rows where description ends with "...", fetches the
 * original issue body from GitHub API, extracts the description section,
 * and outputs a JSON file for the AI rewrite script.
 *
 * Usage: node .github/scripts/app-fetch-descriptions.js [options]
 *   --dry-run    Show what would be fetched without writing output
 *   --verbose    Show detailed output
 *
 * Env vars:
 *   GITHUB_TOKEN   Required — GitHub API token for fetching issue bodies
 */

const fs = require("fs");
const https = require("https");

const APPS_FILE = "apps/APPS.md";
const OUTPUT_FILE = "apps/descriptions-to-fix.json";
const GITHUB_API = "api.github.com";

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

function parseAppsMarkdown() {
    const content = fs.readFileSync(APPS_FILE, "utf8");
    const lines = content.split("\n");

    const headerIdx = lines.findIndex((l) => l.startsWith("| Emoji"));
    if (headerIdx === -1) {
        console.error("Error: Could not find header row in APPS.md");
        process.exit(1);
    }

    const headers = lines[headerIdx].split("|").map((h) => h.trim());

    const DESC_COL = headers.findIndex(
        (h) => h.toLowerCase() === "description",
    );
    const NAME_COL = headers.findIndex((h) => h.toLowerCase() === "name");
    const ISSUE_COL = headers.findIndex((h) => h.toLowerCase() === "issue_url");

    if (DESC_COL === -1 || NAME_COL === -1 || ISSUE_COL === -1) {
        console.error(
            "Error: Could not find required columns (Description, Name, Issue_URL)",
        );
        process.exit(1);
    }

    const truncated = [];
    const dataStartIdx = headerIdx + 2;

    for (let i = dataStartIdx; i < lines.length; i++) {
        const line = lines[i];
        if (!line.startsWith("|")) continue;

        const cols = line.split("|").map((c) => c.trim());
        const description = cols[DESC_COL] || "";
        const name = cols[NAME_COL] || "";
        const issueUrl = cols[ISSUE_COL] || "";

        if (!description.endsWith("...")) continue;
        if (!issueUrl) continue;

        // Extract issue number from URL like https://github.com/pollinations/pollinations/issues/6329
        const issueMatch = issueUrl.match(/issues\/(\d+)/);
        if (!issueMatch) continue;

        truncated.push({
            lineIdx: i,
            name,
            current: description,
            issueNumber: parseInt(issueMatch[1], 10),
            issueUrl,
        });
    }

    return truncated;
}

function fetchIssueBody(issueNumber) {
    return new Promise((resolve) => {
        const options = {
            hostname: GITHUB_API,
            path: `/repos/pollinations/pollinations/issues/${issueNumber}`,
            method: "GET",
            headers: {
                "User-Agent": "pollinations-description-backfill/1.0",
                Accept: "application/vnd.github.v3+json",
            },
        };

        if (process.env.GITHUB_TOKEN) {
            options.headers.Authorization = `token ${process.env.GITHUB_TOKEN}`;
        }

        const req = https.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => {
                data += chunk;
            });
            res.on("end", () => {
                if (res.statusCode === 200) {
                    try {
                        const json = JSON.parse(data);
                        resolve({ body: json.body || "", error: null });
                    } catch {
                        resolve({ body: "", error: "parse error" });
                    }
                } else if (res.statusCode === 404) {
                    resolve({ body: "", error: "not found" });
                } else if (res.statusCode === 403) {
                    resolve({ body: "", error: "rate limited" });
                } else {
                    resolve({ body: "", error: `status ${res.statusCode}` });
                }
            });
        });

        req.on("error", (err) => {
            resolve({ body: "", error: err.message });
        });

        req.setTimeout(10000, () => {
            req.destroy();
            resolve({ body: "", error: "timeout" });
        });

        req.end();
    });
}

/**
 * Extract the app description section from an issue body.
 * Looks for ### App Description, ### Project Description, or similar headings.
 */
function extractDescription(issueBody) {
    if (!issueBody) return "";

    // Try to find description section under a heading
    const headingPatterns = [
        /###\s*(?:App|Project|Application)\s*Description\s*\n([\s\S]*?)(?=\n###|\n---|\n\*\*|$)/i,
        /###\s*Description\s*\n([\s\S]*?)(?=\n###|\n---|\n\*\*|$)/i,
        /\*\*(?:App|Project)?\s*Description\*\*\s*\n([\s\S]*?)(?=\n\*\*|\n###|\n---|$)/i,
    ];

    for (const pattern of headingPatterns) {
        const match = issueBody.match(pattern);
        if (match && match[1].trim()) {
            return cleanText(match[1].trim());
        }
    }

    // Fallback: use the whole body (first meaningful paragraph)
    const lines = issueBody.split("\n").filter((l) => {
        const trimmed = l.trim();
        // Skip empty lines, headings, checkboxes, and metadata
        if (!trimmed) return false;
        if (trimmed.startsWith("#")) return false;
        if (trimmed.startsWith("- [")) return false;
        if (trimmed.startsWith("**") && trimmed.endsWith("**")) return false;
        if (trimmed.startsWith("<!")) return false;
        if (trimmed.startsWith("_No response_")) return false;
        return true;
    });

    if (lines.length > 0) {
        return cleanText(lines.slice(0, 5).join(" "));
    }

    return "";
}

/**
 * Clean raw text: strip markdown formatting, collapse whitespace, remove pipes.
 */
function cleanText(text) {
    return text
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [text](url) → text
        .replace(/[*_~`]/g, "") // Remove markdown formatting
        .replace(/\|/g, " ") // Remove pipes
        .replace(/\r?\n/g, " ") // Newlines → spaces
        .replace(/\s+/g, " ") // Collapse whitespace
        .trim();
}

async function main() {
    console.log(`${colors.bold}📝 App Description Fetcher${colors.reset}\n`);

    if (!process.env.GITHUB_TOKEN) {
        console.error(
            `${colors.red}Error: GITHUB_TOKEN environment variable is required${colors.reset}`,
        );
        process.exit(1);
    }

    if (dryRun) {
        console.log(
            `${colors.yellow}[DRY RUN] No files will be written${colors.reset}\n`,
        );
    }

    const truncated = parseAppsMarkdown();
    console.log(`Found ${truncated.length} apps with truncated descriptions\n`);

    if (truncated.length === 0) {
        console.log(
            `${colors.green}No truncated descriptions found!${colors.reset}`,
        );
        return 0;
    }

    const results = [];
    let errors = 0;
    let extracted = 0;

    for (let i = 0; i < truncated.length; i++) {
        const app = truncated[i];

        if (!verbose) {
            process.stdout.write(`\rFetching: ${i + 1}/${truncated.length}`);
        }

        const { body, error } = await fetchIssueBody(app.issueNumber);

        if (error) {
            if (verbose) {
                console.log(
                    `${colors.yellow}⚠ ${app.name} (#${app.issueNumber}): ${error}${colors.reset}`,
                );
            }
            errors++;
            continue;
        }

        const original = extractDescription(body);

        if (!original) {
            if (verbose) {
                console.log(
                    `${colors.yellow}⚠ ${app.name} (#${app.issueNumber}): no description found in issue body${colors.reset}`,
                );
            }
            errors++;
            continue;
        }

        if (verbose) {
            console.log(
                `${colors.green}✓ ${app.name}: "${original.substring(0, 80)}..."${colors.reset}`,
            );
        }

        results.push({
            lineIdx: app.lineIdx,
            name: app.name,
            current: app.current,
            original,
            issueNumber: app.issueNumber,
        });

        extracted++;

        // Rate limit: 100ms between calls
        await new Promise((r) => setTimeout(r, 100));
    }

    if (!verbose) console.log("\n");

    // Summary
    console.log(`\n${colors.bold}📊 Summary${colors.reset}`);
    console.log(`${colors.green}✓ Extracted: ${extracted}${colors.reset}`);
    console.log(`${colors.yellow}⚠ Errors/skipped: ${errors}${colors.reset}`);
    console.log(`  Total truncated: ${truncated.length}`);

    if (!dryRun && results.length > 0) {
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
        console.log(
            `\n${colors.green}✅ Wrote ${results.length} entries to ${OUTPUT_FILE}${colors.reset}`,
        );
    } else if (dryRun) {
        console.log(
            `\n${colors.cyan}[DRY RUN] Would write ${results.length} entries to ${OUTPUT_FILE}${colors.reset}`,
        );
        if (verbose && results.length > 0) {
            console.log(`\nSample entries:`);
            for (const r of results.slice(0, 3)) {
                console.log(
                    `  ${r.name}: "${r.original.substring(0, 100)}..."`,
                );
            }
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
