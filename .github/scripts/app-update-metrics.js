#!/usr/bin/env node

/**
 * Update app metrics in apps/catalog.json:
 *   - GitHub stars (from GitHub API)
 *   - BYOP status (from Tinybird — apps using secret API keys)
 *   - Request count in last 24h (from Tinybird — by referrer domain)
 *   - Sort rows: BYOP first → requests desc → stars desc
 *
 * Usage: node .github/scripts/app-update-metrics.js [options]
 *   --dry-run    Show changes without modifying files
 *   --verbose    Show detailed output
 *
 * Env vars:
 *   GITHUB_TOKEN         Optional, for GitHub API rate limits
 *   TINYBIRD_READ_TOKEN  Optional, for BYOP + request metrics (skipped if missing)
 */

const https = require("node:https");
const { CATALOG_FILE, readApps, writeApps } = require("./lib/app-catalog.js");

const GITHUB_API = "api.github.com";
const TINYBIRD_HOST = "api.europe-west2.gcp.tinybird.co";

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

function extractHostname(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return "";
    }
}

function loadApps() {
    const catalog = readApps();
    const apps = catalog.map((app) => {
        // GitHub info is optional — some apps don't have repos
        let owner = null;
        let repo = null;
        const match = app.repositoryUrl?.match(
            /github\.com\/([^/]+)\/([^/\s]+)/,
        );
        if (match) {
            owner = match[1];
            repo = match[2].replace(/\.git$/, "");
        }

        return {
            catalogApp: app,
            owner,
            repo,
            webUrlHostname: extractHostname(app.url),
            githubUsername: app.githubUsername,
            githubUserId: app.githubUserId,
            currentStars: app.repositoryStars,
            currentBYOP: app.byop,
            currentRequests: app.requests24h,
        };
    });

    return { catalog, apps };
}

function fetchRepoStars(owner, repo) {
    return new Promise((resolve) => {
        const options = {
            hostname: GITHUB_API,
            path: `/repos/${owner}/${repo}`,
            method: "GET",
            headers: {
                "User-Agent": "pollinations-metrics-updater/1.0",
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

/**
 * Fetch a Tinybird pipe endpoint. Returns parsed JSON response or null on error.
 */
function fetchTinybirdPipe(pipeName) {
    const token = process.env.TINYBIRD_READ_TOKEN;
    if (!token) return Promise.resolve(null);

    return new Promise((resolve) => {
        const options = {
            hostname: TINYBIRD_HOST,
            path: `/v0/pipes/${pipeName}.json`,
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`,
            },
        };

        const req = https.request(options, (res) => {
            let data = "";
            res.on("data", (chunk) => {
                data += chunk;
            });
            res.on("end", () => {
                if (res.statusCode === 200) {
                    try {
                        resolve(JSON.parse(data));
                    } catch {
                        resolve(null);
                    }
                } else {
                    if (verbose) {
                        console.log(
                            `${colors.yellow}⚠ Tinybird pipe ${pipeName} failed: status ${res.statusCode}${colors.reset}`,
                        );
                        if (data)
                            console.log(
                                `  Response: ${data.substring(0, 200)}`,
                            );
                    }
                    resolve(null);
                }
            });
        });

        req.on("error", (err) => {
            if (verbose) {
                console.log(
                    `${colors.yellow}⚠ Tinybird pipe error: ${err.message}${colors.reset}`,
                );
            }
            resolve(null);
        });

        req.setTimeout(30000, () => {
            req.destroy();
            resolve(null);
        });

        req.end();
    });
}

async function fetchTinybirdValues(pipeName, field) {
    const rows = (await fetchTinybirdPipe(pipeName))?.data ?? [];
    return new Set(rows.map((row) => row[field]).filter(Boolean));
}

async function fetchTinybirdCounts(pipeName, keyField) {
    const rows = (await fetchTinybirdPipe(pipeName))?.data ?? [];
    return new Map(
        rows
            .filter((row) => row[keyField])
            .map((row) => [String(row[keyField]), row.requests]),
    );
}

async function main() {
    console.log(`${colors.bold}📊 Apps Metrics Updater${colors.reset}\n`);

    if (dryRun) {
        console.log(
            `${colors.yellow}[DRY RUN] No files will be modified${colors.reset}\n`,
        );
    }

    const { catalog, apps } = loadApps();

    console.log(`Found ${apps.length} apps\n`);

    // Fetch Tinybird metrics (bulk, no per-app calls)
    const hasTinybird = !!process.env.TINYBIRD_READ_TOKEN;
    let byopHostnames = new Set();
    let requestCounts = new Map();
    let byopRequestCounts = new Map();

    if (hasTinybird) {
        console.log(
            `${colors.cyan}Fetching Tinybird metrics...${colors.reset}`,
        );
        [byopHostnames, requestCounts, byopRequestCounts] = await Promise.all([
            fetchTinybirdValues("app_byop_hostnames", "hostname"),
            fetchTinybirdCounts("app_request_counts", "github_user_id"),
            fetchTinybirdCounts("app_byop_request_counts", "hostname"),
        ]);
        console.log(
            `  BYOP hostnames: ${byopHostnames.size}, GitHub users with requests: ${requestCounts.size}, BYOP hostnames with requests: ${byopRequestCounts.size}\n`,
        );
    } else {
        console.log(
            `${colors.yellow}TINYBIRD_READ_TOKEN not set — skipping BYOP and request metrics${colors.reset}\n`,
        );
    }

    const stats = {
        starsUpdated: 0,
        starsDeleted: 0,
        starsUnchanged: 0,
        starsErrors: 0,
        byopUpdated: 0,
        requestsUpdated: 0,
    };
    const changes = [];

    // Process each app
    for (let i = 0; i < apps.length; i++) {
        const app = apps[i];

        // --- Stars (only for apps with GitHub repos) ---
        if (app.owner && app.repo) {
            if (!verbose) {
                process.stdout.write(
                    `\rStars progress: ${i + 1}/${apps.length}`,
                );
            }

            const result = await fetchRepoStars(app.owner, app.repo);

            if (result.error) {
                if (verbose) {
                    console.log(
                        `${colors.yellow}⚠ ${app.owner}/${app.repo}: ${result.error}${colors.reset}`,
                    );
                }
                stats.starsErrors++;
            } else if (!result.exists) {
                if (verbose) {
                    console.log(
                        `${colors.red}❌ ${app.owner}/${app.repo}: repo deleted${colors.reset}`,
                    );
                }
                stats.starsDeleted++;
                if (app.currentStars !== null) {
                    changes.push({
                        app,
                        field: "stars",
                        newValue: null,
                    });
                }
            } else {
                const newStars = result.stars || null;
                if (newStars !== app.currentStars) {
                    if (verbose) {
                        console.log(
                            `${colors.green}⭐ ${app.owner}/${app.repo}: ${app.currentStars || "(none)"} → ${newStars || "(none)"}${colors.reset}`,
                        );
                    }
                    stats.starsUpdated++;
                    changes.push({
                        app,
                        field: "stars",
                        newValue: newStars,
                    });
                } else {
                    stats.starsUnchanged++;
                }
            }

            // rate limit respect
            await new Promise((r) => setTimeout(r, 100));
        }

        // --- BYOP (match hostname against Tinybird secret key names) ---
        if (hasTinybird && app.webUrlHostname) {
            const isBYOP = byopHostnames.has(app.webUrlHostname);
            const newBYOP = isBYOP;
            if (newBYOP !== app.currentBYOP) {
                if (verbose) {
                    console.log(
                        `${colors.green}🔑 ${app.webUrlHostname}: BYOP ${app.currentBYOP || "(none)"} → ${newBYOP || "(none)"}${colors.reset}`,
                    );
                }
                stats.byopUpdated++;
                changes.push({ app, field: "byop", newValue: newBYOP });
            }
        }

        // --- Requests ---
        // BYOP apps: count ALL requests through the app's API key (by hostname)
        // Non-BYOP apps: count requests by the developer's GitHub user ID
        if (hasTinybird) {
            const isBYOP = byopHostnames.has(app.webUrlHostname);
            let count = 0;
            let label = "";
            if (isBYOP && app.webUrlHostname) {
                count = byopRequestCounts.get(app.webUrlHostname) || 0;
                label = app.webUrlHostname;
            } else if (app.githubUserId) {
                count = requestCounts.get(app.githubUserId) || 0;
                label = app.githubUsername;
            }
            const newRequests = count;
            if (newRequests !== app.currentRequests) {
                if (verbose) {
                    console.log(
                        `${colors.green}📈 ${label}: requests ${app.currentRequests || "(none)"} → ${newRequests || "(none)"}${colors.reset}`,
                    );
                }
                stats.requestsUpdated++;
                changes.push({
                    app,
                    field: "requests",
                    newValue: newRequests,
                });
            }
        }
    }

    if (!verbose) console.log("\n");

    // Apply changes to the catalog and write it once.
    if (!dryRun && changes.length > 0) {
        const catalogField = {
            stars: "repositoryStars",
            byop: "byop",
            requests: "requests24h",
        };
        for (const { app, field, newValue } of changes) {
            app.catalogApp[catalogField[field]] = newValue;
        }

        writeApps(catalog);
        console.log(
            `${colors.green}✅ Updated ${CATALOG_FILE}${colors.reset}\n`,
        );
    }

    // Summary
    console.log(`${colors.bold}📊 Summary${colors.reset}`);
    console.log(
        `${colors.green}⭐ Stars updated: ${stats.starsUpdated}${colors.reset}`,
    );
    console.log(
        `${colors.red}❌ Deleted repos: ${stats.starsDeleted}${colors.reset}`,
    );
    console.log(
        `${colors.cyan}- Stars unchanged: ${stats.starsUnchanged}${colors.reset}`,
    );
    console.log(
        `${colors.yellow}⚠ Stars errors: ${stats.starsErrors}${colors.reset}`,
    );
    if (hasTinybird) {
        console.log(
            `${colors.green}🔑 BYOP updated: ${stats.byopUpdated}${colors.reset}`,
        );
        console.log(
            `${colors.green}📈 Requests updated: ${stats.requestsUpdated}${colors.reset}`,
        );
    }

    if (changes.length > 0) {
        console.log(`\n${colors.bold}Changes:${colors.reset}`);
        for (const c of changes.slice(0, 30)) {
            const icon =
                c.field === "stars" ? "⭐" : c.field === "byop" ? "🔑" : "📈";
            const label = c.app.owner
                ? `${c.app.owner}/${c.app.repo}`
                : c.app.githubUsername || c.app.webUrlHostname;
            console.log(
                `  ${icon} ${label}: ${c.field} → ${c.newValue || "(empty)"}`,
            );
        }
        if (changes.length > 30) {
            console.log(`  ... and ${changes.length - 30} more`);
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
