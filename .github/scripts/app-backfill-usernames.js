#!/usr/bin/env node

/**
 * Backfill missing GitHub usernames and user IDs in apps/APPS.md.
 * Fetches issue authors from the GitHub API for rows that have an Issue_URL
 * but no GitHub_Username.
 *
 * Usage: node .github/scripts/app-backfill-usernames.js [options]
 *   --dry-run    Show changes without modifying APPS.md
 *   --verbose    Show detailed output
 *
 * Env vars:
 *   GITHUB_TOKEN   Required — for GitHub API access
 */

const fs = require("fs");
const https = require("https");

const APPS_FILE = "apps/APPS.md";
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

function fetchJSON(path) {
    return new Promise((resolve) => {
        const options = {
            hostname: GITHUB_API,
            path,
            method: "GET",
            headers: {
                "User-Agent": "pollinations-backfill/1.0",
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
                        resolve({ data: JSON.parse(data) });
                    } catch {
                        resolve({ error: "parse error" });
                    }
                } else {
                    resolve({ error: `status ${res.statusCode}` });
                }
            });
        });

        req.on("error", (err) => resolve({ error: err.message }));
        req.setTimeout(10000, () => {
            req.destroy();
            resolve({ error: "timeout" });
        });
        req.end();
    });
}

async function main() {
    console.log(`${colors.bold}👤 App Username Backfill${colors.reset}\n`);

    if (!process.env.GITHUB_TOKEN) {
        console.error(
            `${colors.red}Error: GITHUB_TOKEN environment variable is required${colors.reset}`,
        );
        process.exit(1);
    }

    if (dryRun) {
        console.log(
            `${colors.yellow}[DRY RUN] APPS.md will not be modified${colors.reset}\n`,
        );
    }

    const content = fs.readFileSync(APPS_FILE, "utf8");
    const lines = content.split("\n");

    const headerIdx = lines.findIndex((l) => l.startsWith("| Emoji"));
    const headers = lines[headerIdx].split("|").map((h) => h.trim());

    const USERNAME_COL = headers.findIndex(
        (h) => h.toLowerCase() === "github_username",
    );
    const USERID_COL = headers.findIndex(
        (h) => h.toLowerCase() === "github_userid",
    );
    const ISSUE_COL = headers.findIndex((h) => h.toLowerCase() === "issue_url");
    const NAME_COL = headers.findIndex((h) => h.toLowerCase() === "name");

    if (USERNAME_COL === -1 || ISSUE_COL === -1) {
        console.error(
            `${colors.red}Error: Could not find required columns${colors.reset}`,
        );
        process.exit(1);
    }

    console.log(
        `Column indices: Username=${USERNAME_COL}, UserID=${USERID_COL}, Issue=${ISSUE_COL}\n`,
    );

    const toFix = [];
    const dataStartIdx = headerIdx + 2;

    for (let i = dataStartIdx; i < lines.length; i++) {
        const line = lines[i];
        if (!line.startsWith("|")) continue;

        const cols = line.split("|");
        if (cols.length <= Math.max(USERNAME_COL, ISSUE_COL)) continue;

        const username = (cols[USERNAME_COL] || "").trim();
        const issueUrl = (cols[ISSUE_COL] || "").trim();
        const name = (cols[NAME_COL] || "").trim();

        if (username) continue; // Already has a username
        if (!issueUrl.includes("github.com")) continue; // No issue URL

        const issueMatch = issueUrl.match(/issues\/(\d+)/);
        if (!issueMatch) continue;

        const issueNumber = issueMatch[1];

        // Skip shared issue URLs that many rows reference but aren't
        // actual app submissions (only count issues referenced once)
        toFix.push({
            lineIdx: i,
            name,
            issueNumber,
            issueUrl,
        });
    }

    // Count how many rows reference each issue URL across ALL rows (not just toFix)
    const issueRefCounts = {};
    for (let i = dataStartIdx; i < lines.length; i++) {
        const line = lines[i];
        if (!line.startsWith("|")) continue;
        const cols = line.split("|");
        const url = (cols[ISSUE_COL] || "").trim();
        const m = url.match(/issues\/(\d+)/);
        if (m) {
            issueRefCounts[m[1]] = (issueRefCounts[m[1]] || 0) + 1;
        }
    }

    // Filter out rows whose issue URL is shared by many rows (not real submissions)
    const SHARED_ISSUE_THRESHOLD = 3;
    const filtered = toFix.filter((app) => {
        const refs = issueRefCounts[app.issueNumber] || 0;
        if (refs >= SHARED_ISSUE_THRESHOLD) {
            if (verbose) {
                console.log(
                    `${colors.yellow}⏭ ${app.name}: skipping — issue #${app.issueNumber} is referenced by ${refs} rows (not a real submission)${colors.reset}`,
                );
            }
            return false;
        }
        return true;
    });

    console.log(
        `Found ${toFix.length} apps missing GitHub usernames (${toFix.length - filtered.length} skipped as shared-issue duplicates)\n`,
    );

    if (filtered.length === 0) {
        console.log(`${colors.green}All apps have usernames!${colors.reset}`);
        return 0;
    }

    const changes = [];
    let errors = 0;

    for (let i = 0; i < filtered.length; i++) {
        const app = filtered[i];

        if (!verbose) {
            process.stdout.write(`\rFetching: ${i + 1}/${filtered.length}`);
        }

        // Fetch issue to get author
        const { data: issue, error } = await fetchJSON(
            `/repos/pollinations/pollinations/issues/${app.issueNumber}`,
        );

        if (error) {
            if (verbose) {
                console.log(
                    `${colors.yellow}⚠ ${app.name} (#${app.issueNumber}): ${error}${colors.reset}`,
                );
            }
            errors++;
            continue;
        }

        const author = issue.user?.login;
        if (!author) {
            if (verbose) {
                console.log(
                    `${colors.yellow}⚠ ${app.name} (#${app.issueNumber}): no author found${colors.reset}`,
                );
            }
            errors++;
            continue;
        }

        const userId = issue.user?.id ? String(issue.user.id) : "";

        if (verbose) {
            console.log(
                `${colors.green}✓ ${app.name}: @${author} (${userId})${colors.reset}`,
            );
        }

        changes.push({
            lineIdx: app.lineIdx,
            name: app.name,
            author,
            userId,
        });

        // Rate limit
        await new Promise((r) => setTimeout(r, 100));
    }

    if (!verbose) console.log("\n");

    // Apply changes
    if (!dryRun && changes.length > 0) {
        for (const change of changes) {
            const cols = lines[change.lineIdx].split("|");
            cols[USERNAME_COL] = ` @${change.author} `;
            if (USERID_COL !== -1) {
                cols[USERID_COL] = ` ${change.userId} `;
            }
            lines[change.lineIdx] = cols.join("|");
        }

        fs.writeFileSync(APPS_FILE, lines.join("\n"));
        console.log(
            `\n${colors.green}✅ Updated ${changes.length} usernames in ${APPS_FILE}${colors.reset}`,
        );
    }

    // Summary
    console.log(`\n${colors.bold}📊 Summary${colors.reset}`);
    console.log(
        `${colors.green}✓ Backfilled: ${changes.length}${colors.reset}`,
    );
    console.log(`${colors.yellow}⚠ Errors: ${errors}${colors.reset}`);

    if (dryRun && changes.length > 0) {
        console.log(`\n${colors.cyan}[DRY RUN] Would update:${colors.reset}`);
        for (const c of changes) {
            console.log(`  ${c.name}: @${c.author} (${c.userId})`);
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
