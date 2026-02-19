#!/usr/bin/env node

/**
 * Update app metrics in apps/APPS.md:
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

const fs = require("fs");
const https = require("https");

const APPS_FILE = "apps/APPS.md";
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

function parseAppsMarkdown() {
    const content = fs.readFileSync(APPS_FILE, "utf8");
    const lines = content.split("\n");

    const headerIdx = lines.findIndex((l) => l.startsWith("| Emoji"));
    if (headerIdx === -1) {
        console.error("Error: Could not find header row in APPS.md");
        process.exit(1);
    }

    const headers = lines[headerIdx].split("|").map((h) => h.trim());

    // Dynamic column lookup
    const REPO_URL_COL = headers.findIndex((h) =>
        h.toLowerCase().includes("repository_url"),
    );
    const STARS_COL = headers.findIndex((h) =>
        h.toLowerCase().includes("repository_stars"),
    );
    const WEB_URL_COL = headers.findIndex((h) => h.toLowerCase() === "web_url");
    const GITHUB_USER_COL = headers.findIndex(
        (h) => h.toLowerCase() === "github_username",
    );
    const BYOP_COL = headers.findIndex((h) => h.toLowerCase() === "byop");
    const REQUESTS_COL = headers.findIndex(
        (h) => h.toLowerCase() === "requests_24h",
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
        const webUrl = cols[WEB_URL_COL] || "";
        const githubUsername =
            GITHUB_USER_COL !== -1
                ? (cols[GITHUB_USER_COL] || "").replace(/^@/, "")
                : "";

        // GitHub info is optional — some apps don't have repos
        let owner = null;
        let repo = null;
        const match = repoUrl.match(/github\.com\/([^/]+)\/([^/\s]+)/);
        if (match) {
            owner = match[1];
            repo = match[2].replace(/\.git$/, "");
        }

        apps.push({
            lineIdx: i,
            owner,
            repo,
            repoUrl,
            currentStars: cols[STARS_COL] || "",
            webUrlHostname: extractHostname(webUrl),
            githubUsername,
            currentBYOP: BYOP_COL !== -1 ? cols[BYOP_COL] || "" : "",
            currentRequests:
                REQUESTS_COL !== -1 ? cols[REQUESTS_COL] || "" : "",
            starsColIdx: STARS_COL,
            byopColIdx: BYOP_COL,
            requestsColIdx: REQUESTS_COL,
        });
    }

    return { lines, apps, headerIdx, dataStartIdx };
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

/**
 * Fetch BYOP hostnames from Tinybird pipe — api_key_name values that look like hostnames.
 * Returns Set<string> of hostnames for BYOP apps.
 */
async function fetchBYOPHostnames() {
    const result = await fetchTinybirdPipe("app_byop_hostnames");
    if (!result || !result.data) return new Set();

    const hostnames = new Set();
    for (const row of result.data) {
        const name = row.hostname;
        if (name) {
            hostnames.add(name);
        }
    }
    return hostnames;
}

/**
 * Fetch request counts by GitHub username from Tinybird pipe — last 24 hours.
 * Returns Map<string, number> mapping github_username -> request count.
 */
async function fetchRequestCounts() {
    const result = await fetchTinybirdPipe("app_request_counts");
    if (!result || !result.data) return new Map();

    const counts = new Map();
    for (const row of result.data) {
        const username = row.github_username;
        if (username) {
            counts.set(username, row.requests);
        }
    }
    return counts;
}

/**
 * Fetch request counts by BYOP hostname from Tinybird pipe — last 24 hours.
 * Counts ALL requests through a BYOP app's API key (all end users).
 * Returns Map<string, number> mapping hostname -> request count.
 */
async function fetchBYOPRequestCounts() {
    const result = await fetchTinybirdPipe("app_byop_request_counts");
    if (!result || !result.data) return new Map();

    const counts = new Map();
    for (const row of result.data) {
        const hostname = row.hostname;
        if (hostname) {
            counts.set(hostname, row.requests);
        }
    }
    return counts;
}

function formatStars(count) {
    if (count === 0) return "";
    return `⭐${count}`;
}

async function main() {
    console.log(`${colors.bold}📊 Apps Metrics Updater${colors.reset}\n`);

    if (dryRun) {
        console.log(
            `${colors.yellow}[DRY RUN] No files will be modified${colors.reset}\n`,
        );
    }

    const { lines, apps } = parseAppsMarkdown();

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
            fetchBYOPHostnames(),
            fetchRequestCounts(),
            fetchBYOPRequestCounts(),
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
                changes.push({
                    app,
                    field: "stars",
                    newValue: "❌ deleted",
                });
            } else {
                const newStarsStr = formatStars(result.stars);
                if (newStarsStr !== app.currentStars) {
                    if (verbose) {
                        console.log(
                            `${colors.green}⭐ ${app.owner}/${app.repo}: ${app.currentStars || "(none)"} → ${newStarsStr || "(none)"}${colors.reset}`,
                        );
                    }
                    stats.starsUpdated++;
                    changes.push({
                        app,
                        field: "stars",
                        newValue: newStarsStr,
                    });
                } else {
                    stats.starsUnchanged++;
                }
            }

            // rate limit respect
            await new Promise((r) => setTimeout(r, 100));
        }

        // --- BYOP (match hostname against Tinybird secret key names) ---
        if (hasTinybird && app.byopColIdx !== -1 && app.webUrlHostname) {
            const isBYOP = byopHostnames.has(app.webUrlHostname);
            const newBYOP = isBYOP ? "true" : "";
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
        // Non-BYOP apps: count requests by the developer's GitHub username
        if (hasTinybird && app.requestsColIdx !== -1) {
            const isBYOP = byopHostnames.has(app.webUrlHostname);
            let count = 0;
            let label = "";
            if (isBYOP && app.webUrlHostname) {
                count = byopRequestCounts.get(app.webUrlHostname) || 0;
                label = app.webUrlHostname;
            } else if (app.githubUsername) {
                count = requestCounts.get(app.githubUsername) || 0;
                label = app.githubUsername;
            }
            const newRequests = count > 0 ? String(count) : "";
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

    // Apply changes to lines
    if (!dryRun && changes.length > 0) {
        for (const change of changes) {
            const { app, field, newValue } = change;
            const cols = lines[app.lineIdx].split("|");
            if (field === "stars") {
                cols[app.starsColIdx] = ` ${newValue} `;
            } else if (field === "byop") {
                cols[app.byopColIdx] = ` ${newValue} `;
            } else if (field === "requests") {
                cols[app.requestsColIdx] = ` ${newValue} `;
            }
            lines[app.lineIdx] = cols.join("|");
        }

        fs.writeFileSync(APPS_FILE, lines.join("\n"));
        console.log(`${colors.green}✅ Updated ${APPS_FILE}${colors.reset}\n`);
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
