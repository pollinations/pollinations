#!/usr/bin/env node

/**
 * Update GitHub stars for all apps in apps/APPS.md
 * Also checks if repos still exist (marks deleted ones)
 *
 * Usage: node .github/scripts/app-update-stars.js [options]
 *   --dry-run    Show changes without modifying files
 *   --verbose    Show detailed output
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

function parseAppsMarkdown() {
    const content = fs.readFileSync(APPS_FILE, "utf8");
    const lines = content.split("\n");

    const headerIdx = lines.findIndex((l) => l.startsWith("| Emoji"));
    if (headerIdx === -1) {
        console.error("Error: Could not find header row in APPS.md");
        process.exit(1);
    }

    // Dynamic column lookup to be robust against header changes
    const headers = lines[headerIdx].split("|").map((h) => h.trim());
    const REPO_URL_COL = headers.findIndex((h) =>
        h.toLowerCase().includes("repository_url"),
    );
    const STARS_COL = headers.findIndex((h) =>
        h.toLowerCase().includes("repository_stars"),
    );

    if (REPO_URL_COL === -1 || STARS_COL === -1) {
        console.error("Error: Could not find repository URL or stars columns");
        process.exit(1);
    }

    const apps = [];
    const dataStartIdx = headerIdx + 2;

    for (let i = dataStartIdx; i < lines.length; i++) {
        const line = lines[i];
        if (!line.startsWith("|")) continue;

        const cols = line.split("|").map((c) => c.trim());
        if (cols.length <= Math.max(REPO_URL_COL, STARS_COL)) continue;

        const repoUrl = cols[REPO_URL_COL] || "";
        const starsCell = cols[STARS_COL] || "";

        if (!repoUrl.includes("github.com")) continue;

        const match = repoUrl.match(/github\.com\/([^/]+)\/([^/\s]+)/);
        if (!match) continue;

        apps.push({
            lineIdx: i,
            owner: match[1],
            repo: match[2].replace(/\.git$/, ""),
            repoUrl,
            currentStars: starsCell,
            repoUrlColIdx: REPO_URL_COL,
            starsColIdx: STARS_COL,
        });
    }

    return { lines, apps, headerIdx };
}

function fetchRepoStars(owner, repo) {
    return new Promise((resolve) => {
        const options = {
            hostname: GITHUB_API,
            path: `/repos/${owner}/${repo}`,
            method: "GET",
            headers: {
                "User-Agent": "pollinations-star-updater/1.0",
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
                if (res.statusCode === 404) {
                    resolve({ exists: false, stars: 0 });
                } else if (res.statusCode === 200) {
                    try {
                        const json = JSON.parse(data);
                        resolve({
                            exists: true,
                            stars: json.stargazers_count || 0,
                        });
                    } catch {
                        resolve({
                            exists: true,
                            stars: 0,
                            error: "parse error",
                        });
                    }
                } else if (res.statusCode === 403) {
                    resolve({ exists: true, stars: 0, error: "rate limited" });
                } else {
                    resolve({
                        exists: true,
                        stars: 0,
                        error: `status ${res.statusCode}`,
                    });
                }
            });
        });

        req.on("error", (err) => {
            resolve({ exists: true, stars: 0, error: err.message });
        });

        req.setTimeout(10000, () => {
            req.destroy();
            resolve({ exists: true, stars: 0, error: "timeout" });
        });

        req.end();
    });
}

function formatStars(count) {
    if (count === 0) return "";
    return `⭐${count}`;
}

async function main() {
    console.log(`${colors.bold}⭐ Apps Star Updater${colors.reset}\n`);

    if (dryRun) {
        console.log(
            `${colors.yellow}[DRY RUN] No files will be modified${colors.reset}\n`,
        );
    }

    const { lines, apps } = parseAppsMarkdown();

    console.log(`Found ${apps.length} apps with GitHub repos\n`);

    const stats = { updated: 0, deleted: 0, unchanged: 0, errors: 0 };
    const changes = [];

    for (let i = 0; i < apps.length; i++) {
        const app = apps[i];

        if (!verbose) {
            process.stdout.write(`\rProgress: ${i + 1}/${apps.length}`);
        }

        const result = await fetchRepoStars(app.owner, app.repo);

        if (result.error) {
            if (verbose) {
                console.log(
                    `${colors.yellow}⚠ ${app.owner}/${app.repo}: ${result.error}${colors.reset}`,
                );
            }
            stats.errors++;
            continue;
        }

        if (!result.exists) {
            if (verbose) {
                console.log(
                    `${colors.red}❌ ${app.owner}/${app.repo}: repo deleted${colors.reset}`,
                );
            }
            stats.deleted++;
            changes.push({ app, newStars: "❌ deleted", type: "deleted" });
            continue;
        }

        const newStarsStr = formatStars(result.stars);
        if (newStarsStr !== app.currentStars) {
            if (verbose) {
                console.log(
                    `${colors.green}✓ ${app.owner}/${app.repo}: ${app.currentStars || "(none)"} → ${newStarsStr || "(none)"}${colors.reset}`,
                );
            }
            stats.updated++;
            changes.push({ app, newStars: newStarsStr, type: "updated" });
        } else {
            stats.unchanged++;
        }

        // rate limit respect
        await new Promise((r) => setTimeout(r, 100));
    }

    if (!verbose) console.log("\n");

    // apply changes
    if (!dryRun && changes.length > 0) {
        for (const change of changes) {
            const { app, newStars } = change;
            const cols = lines[app.lineIdx].split("|");
            cols[app.starsColIdx + 1] = ` ${newStars} `;
            lines[app.lineIdx] = cols.join("|");
        }
        fs.writeFileSync(APPS_FILE, lines.join("\n"));
        console.log(`${colors.green}✅ Updated ${APPS_FILE}${colors.reset}\n`);
    }

    // summary
    console.log(`${colors.bold}📊 Summary${colors.reset}`);
    console.log(`${colors.green}✓ Updated: ${stats.updated}${colors.reset}`);
    console.log(
        `${colors.red}✗ Deleted repos: ${stats.deleted}${colors.reset}`,
    );
    console.log(`${colors.cyan}- Unchanged: ${stats.unchanged}${colors.reset}`);
    console.log(`${colors.yellow}⚠ Errors: ${stats.errors}${colors.reset}`);

    if (changes.length > 0) {
        console.log(`\n${colors.bold}Changes:${colors.reset}`);
        for (const c of changes.slice(0, 20)) {
            const icon = c.type === "deleted" ? "❌" : "⭐";
            console.log(
                `  ${icon} ${c.app.owner}/${c.app.repo}: ${c.app.currentStars || "(none)"} → ${c.newStars || "(none)"}`,
            );
        }
        if (changes.length > 20) {
            console.log(`  ... and ${changes.length - 20} more`);
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
