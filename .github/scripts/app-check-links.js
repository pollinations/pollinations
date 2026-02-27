#!/usr/bin/env node

/**
 * Check all app links in apps/APPS.md and report broken ones
 *
 * Usage: node .github/scripts/app-check-links.js [options]
 *
 * Options:
 *   --timeout=<ms>    Set timeout in milliseconds (default: 10000)
 *   --category=<name> Check only specific category
 *   --verbose         Show detailed output
 *   --report          Generate BROKEN_APPS.md report
 *   --health-update   Track daily health: increment failure counters, open removal PR at threshold
 */

const fs = require("node:fs");
const https = require("node:https");
const http = require("node:http");
const { execFileSync } = require("node:child_process");

const APPS_FILE = "apps/APPS.md";
const REPORT_FILE = "apps/BROKEN_APPS.md";
const DEFAULT_TIMEOUT = 10000;
const HEALTH_THRESHOLD = 7;
const CONCURRENCY = 20;

// URLs that return false-positive errors (anti-bot protection)
const SKIP_URL_HOSTS = ["npmjs.com", "pypi.org"];

// HTTP status codes to treat as "alive" (anti-bot, auth, rate-limit, geo-block)
const SKIP_STATUS_CODES = new Set([401, 403, 429, 451]);

const colors = {
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
    reset: "\x1b[0m",
    bold: "\x1b[1m",
};

// Parse command line arguments
const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const shouldReport = args.includes("--report");
const timeoutArg = args.find((a) => a.startsWith("--timeout="));
const timeout = timeoutArg
    ? parseInt(timeoutArg.split("=")[1], 10)
    : DEFAULT_TIMEOUT;
const categoryArg = args.find((a) => a.startsWith("--category="));
const filterCategory = categoryArg
    ? categoryArg.split("=")[1].toLowerCase()
    : null;
const shouldHealthUpdate = args.includes("--health-update");

/**
 * Parse APPS.md and extract app data
 */
function parseAppsMarkdown() {
    const content = fs.readFileSync(APPS_FILE, "utf8");
    const lines = content.split("\n");

    const headerIdx = lines.findIndex((l) => l.startsWith("| Emoji"));
    if (headerIdx === -1) {
        console.error("Error: Could not find header row in APPS.md");
        process.exit(1);
    }

    // Find Health column index dynamically from header
    const headers = lines[headerIdx]
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
    const healthColIdx = headers.findIndex((h) => h.toLowerCase() === "health");

    const apps = [];
    const dataRows = lines
        .slice(headerIdx + 2)
        .filter((l) => l.startsWith("|"));

    for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        // Split by | and drop first/last empty segments from leading/trailing pipes
        const cols = row
            .split("|")
            .slice(1, -1)
            .map((c) => c.trim());

        if (cols.length < 15) continue;

        // Format: Emoji | Name | Web_URL | Description | Language | Category | GitHub_Username | GitHub_UserID | Github_Repository_URL | Github_Repository_Stars | Discord_Username | Other | Submitted_Date | Issue_URL | Approved_Date | BYOP | Requests_24h | Health
        const name = cols[1];
        const url = cols[2];
        const currentHealth =
            healthColIdx >= 0 ? parseInt(cols[healthColIdx], 10) || 0 : 0;

        apps.push({
            lineIndex: headerIdx + 2 + i,
            emoji: cols[0],
            name,
            url,
            description: cols[3],
            language: cols[4],
            category: (cols[5] || "").toLowerCase(),
            github: cols[6],
            githubId: cols[7],
            repo: cols[8],
            stars: cols[9],
            discord: cols[10],
            other: cols[11],
            submittedDate: cols[12],
            issueUrl: cols[13],
            approvedDate: cols[14],
            byop: cols[15] || "",
            requests24h: cols[16] || "",
            currentHealth,
            rawLine: row,
        });
    }

    return { apps, lines, headerIdx, healthColIdx };
}

/**
 * Check if a URL is accessible
 */
function checkUrl(url) {
    return new Promise((resolve) => {
        if (!url || !url.startsWith("http")) {
            resolve({ status: "skip", reason: "Invalid URL" });
            return;
        }

        const protocol = url.startsWith("https") ? https : http;

        const req = protocol.get(
            url,
            {
                timeout,
                headers: {
                    "User-Agent":
                        "Mozilla/5.0 (compatible; pollinations-link-checker/1.0; +https://pollinations.ai)",
                },
            },
            (res) => {
                res.resume(); // drain body to free socket
                resolve({
                    status: res.statusCode,
                    ok: res.statusCode >= 200 && res.statusCode < 400,
                    redirect: res.statusCode >= 300 && res.statusCode < 400,
                    location: res.headers.location,
                });
            },
        );

        req.on("error", (err) => {
            resolve({ status: "error", reason: err.message, ok: false });
        });

        req.on("timeout", () => {
            req.destroy();
            resolve({
                status: "timeout",
                reason: "Request timed out",
                ok: false,
            });
        });
    });
}

/**
 * Main function
 */
async function main() {
    console.log(`${colors.bold}🔗 Apps Link Checker${colors.reset}\n`);

    const { apps } = parseAppsMarkdown();

    // Filter by category if specified
    const appsToCheck = filterCategory
        ? apps.filter((a) => a.category === filterCategory)
        : apps;

    console.log(
        `Found ${appsToCheck.length} apps to check${filterCategory ? ` (category: ${filterCategory})` : ""}\n`,
    );

    const results = {
        ok: [],
        broken: [],
        timeout: [],
        error: [],
        skip: [],
    };

    for (let i = 0; i < appsToCheck.length; i++) {
        const app = appsToCheck[i];

        if (verbose) {
            console.log(
                `[${i + 1}/${appsToCheck.length}] Checking: ${app.name}`,
            );
        } else {
            process.stdout.write(
                `\rProgress: ${i + 1}/${appsToCheck.length} (${Math.round(((i + 1) / appsToCheck.length) * 100)}%)`,
            );
        }

        // Check main URL
        const urlResult = await checkUrl(app.url);

        // Check repo URL if different from main URL
        let repoResult = { status: "skip" };
        if (app.repo && app.repo !== app.url && app.repo.startsWith("http")) {
            repoResult = await checkUrl(app.repo);
        }

        const appResult = {
            ...app,
            urlResult,
            repoResult,
        };

        // Categorize result
        if (urlResult.status === "skip") {
            results.skip.push(appResult);
        } else if (urlResult.status === "timeout") {
            results.timeout.push(appResult);
        } else if (urlResult.status === "error") {
            results.error.push(appResult);
        } else if (!urlResult.ok && urlResult.status >= 400) {
            results.broken.push(appResult);
        } else {
            results.ok.push(appResult);
        }

        if (verbose) {
            const statusIcon = urlResult.ok
                ? "✅"
                : urlResult.status === "timeout"
                  ? "⏱️"
                  : "❌";
            console.log(`  ${statusIcon} URL: ${urlResult.status}`);
            if (app.repo && repoResult.status !== "skip") {
                const repoIcon = repoResult.ok ? "✅" : "❌";
                console.log(`  ${repoIcon} Repo: ${repoResult.status}`);
            }
        }

        // Small delay to be respectful
        await new Promise((r) => setTimeout(r, 100));
    }

    if (!verbose) console.log("\n");

    // Summary
    console.log(`${colors.bold}📊 Summary${colors.reset}`);
    console.log(
        `${colors.green}✅ Working: ${results.ok.length}${colors.reset}`,
    );
    console.log(
        `${colors.red}❌ Broken (4xx/5xx): ${results.broken.length}${colors.reset}`,
    );
    console.log(
        `${colors.yellow}⏱️  Timeout: ${results.timeout.length}${colors.reset}`,
    );
    console.log(
        `${colors.yellow}💥 Error: ${results.error.length}${colors.reset}`,
    );
    console.log(
        `${colors.cyan}⏭️  Skipped: ${results.skip.length}${colors.reset}`,
    );

    const brokenApps = [
        ...results.broken,
        ...results.timeout,
        ...results.error,
    ];

    if (brokenApps.length > 0) {
        console.log(
            `\n${colors.bold}${colors.red}🚨 Broken Apps${colors.reset}`,
        );
        for (const app of brokenApps) {
            console.log(`\n${colors.red}● ${app.name}${colors.reset}`);
            console.log(`  URL: ${app.url}`);
            console.log(
                `  Status: ${app.urlResult.status} ${app.urlResult.reason || ""}`,
            );
            console.log(`  Category: ${app.category}`);
            console.log(`  Submitted: ${app.submittedDate}`);
        }
    }

    // Generate report file
    if (shouldReport && brokenApps.length > 0) {
        const reportContent = generateReport(brokenApps, results);
        fs.writeFileSync(REPORT_FILE, reportContent);
        console.log(
            `\n${colors.green}📄 Report saved to: ${REPORT_FILE}${colors.reset}`,
        );
    }

    // Return exit code based on broken links
    if (brokenApps.length > 0) {
        console.log(
            `\n${colors.yellow}⚠️  ${brokenApps.length} apps need attention${colors.reset}`,
        );
    } else {
        console.log(`\n${colors.green}✅ All apps are working!${colors.reset}`);
    }

    return brokenApps.length;
}

/**
 * Generate markdown report
 */
function generateReport(brokenApps, results) {
    const now = new Date().toISOString().split("T")[0];

    let report = `# Broken Apps Report

> Generated: ${now}

## Summary

- ✅ Working: ${results.ok.length}
- ❌ Broken: ${results.broken.length}
- ⏱️ Timeout: ${results.timeout.length}
- 💥 Error: ${results.error.length}

## Broken Apps

| Name | URL | Status | Category | Submitted |
|------|-----|--------|----------|-----------|
`;

    for (const app of brokenApps) {
        const status =
            app.urlResult.status === "timeout"
                ? "⏱️ Timeout"
                : app.urlResult.status === "error"
                  ? `💥 ${app.urlResult.reason}`
                  : `❌ ${app.urlResult.status}`;
        report += `| ${app.name} | ${app.url} | ${status} | ${app.category} | ${app.submittedDate} |\n`;
    }

    report += `\n## Actions

- Review each broken app and determine if it should be removed or updated
- Contact app authors via Discord or GitHub if available
- Remove apps that have been broken for more than 30 days
`;

    return report;
}

/**
 * Classify a check result: should we count it as a failure?
 */
function classifyResult(url, result) {
    // No URL to check
    if (result.status === "skip") return "skip";

    // Anti-bot hosts always return errors to crawlers
    if (url && SKIP_URL_HOSTS.some((h) => url.includes(h))) return "skip";

    // Status codes that indicate the site is alive but blocking us
    if (SKIP_STATUS_CODES.has(result.status)) return "skip";

    // 2xx and 3xx are healthy
    if (result.ok) return "healthy";

    // Everything else is broken
    return "broken";
}

/**
 * Format a check result for display in PR body
 */
function formatError(result) {
    if (result.status === "error") return result.reason;
    if (result.status === "timeout") return "Timeout";
    return `HTTP ${result.status}`;
}

/**
 * Check a single app and return its health result
 */
async function checkAppHealth(app) {
    const urlToCheck = app.url?.startsWith("http")
        ? app.url
        : app.repo?.startsWith("http")
          ? app.repo
          : null;

    let result;
    if (!urlToCheck) {
        result = { status: "skip", reason: "No URL" };
    } else {
        result = await checkUrl(urlToCheck);
    }

    const classification = classifyResult(urlToCheck, result);
    const newHealth =
        classification === "skip" || classification === "healthy"
            ? 0
            : app.currentHealth + 1;

    return { app, urlToCheck, result, classification, newHealth };
}

/**
 * Run async tasks with a concurrency limit
 */
async function runWithConcurrency(tasks, limit) {
    const results = new Array(tasks.length);
    let nextIdx = 0;

    async function worker() {
        while (nextIdx < tasks.length) {
            const idx = nextIdx++;
            results[idx] = await tasks[idx]();
        }
    }

    await Promise.all(
        Array.from({ length: Math.min(limit, tasks.length) }, () => worker()),
    );
    return results;
}

/**
 * Health update mode: track daily failures and open removal PR at threshold
 */
async function healthUpdate() {
    console.log(`${colors.bold}🏥 Health Update Mode${colors.reset}\n`);

    const { apps, lines, healthColIdx } = parseAppsMarkdown();

    if (healthColIdx < 0) {
        console.error("Error: Health column not found in APPS.md header");
        process.exit(1);
    }

    // Write path uses unsliced split("|") which has a leading empty string,
    // so column indices are offset by +1 compared to the sliced parse path.
    const writeColIdx = healthColIdx + 1;

    console.log(
        `Checking ${apps.length} apps (concurrency: ${CONCURRENCY})...\n`,
    );

    let completed = 0;
    const tasks = apps.map((app) => async () => {
        const result = await checkAppHealth(app);
        completed++;
        if (verbose) {
            const icon =
                result.classification === "healthy"
                    ? "✅"
                    : result.classification === "skip"
                      ? "⏭️"
                      : "❌";
            console.log(
                `[${completed}/${apps.length}] ${app.name} (health: ${app.currentHealth})`,
            );
            console.log(
                `  ${icon} ${result.urlToCheck || "no URL"} → ${result.classification}${result.newHealth > 0 ? ` (${result.newHealth} days)` : ""}`,
            );
        } else {
            process.stdout.write(
                `\rProgress: ${completed}/${apps.length} (${Math.round((completed / apps.length) * 100)}%)`,
            );
        }
        return result;
    });

    const results = await runWithConcurrency(tasks, CONCURRENCY);

    if (!verbose) console.log("\n");

    const changes = [];
    const thresholdApps = [];

    for (const { app, urlToCheck, result, newHealth } of results) {
        // Update the Health column in the line
        if (newHealth !== app.currentHealth) {
            const cols = lines[app.lineIndex].split("|");
            cols[writeColIdx] = newHealth > 0 ? ` ${newHealth} ` : "  ";
            lines[app.lineIndex] = cols.join("|");
            changes.push({
                name: app.name,
                from: app.currentHealth,
                to: newHealth,
            });
        }

        if (newHealth >= HEALTH_THRESHOLD) {
            thresholdApps.push({
                ...app,
                newHealth,
                urlChecked: urlToCheck,
                error: formatError(result),
            });
        }
    }

    // Write updated health counters back to APPS.md (the workflow commits this)
    if (changes.length > 0) {
        fs.writeFileSync(APPS_FILE, lines.join("\n"));
        console.log(
            `${colors.green}Updated ${changes.length} health counters${colors.reset}`,
        );
    } else {
        console.log("No health changes.");
    }

    // Summary
    const failingCount = results.filter((r) => r.newHealth > 0).length;
    console.log(`\n${colors.bold}📊 Health Summary${colors.reset}`);
    console.log(`  Currently failing: ${failingCount} apps`);
    console.log(
        `  At threshold (>=${HEALTH_THRESHOLD}): ${thresholdApps.length} apps`,
    );

    // Open removal PR if there are threshold apps
    if (thresholdApps.length > 0) {
        console.log(
            `\n${colors.yellow}🗑️  ${thresholdApps.length} apps reached removal threshold${colors.reset}`,
        );
        for (const app of thresholdApps) {
            console.log(
                `  ${colors.red}● ${app.name}${colors.reset} — ${app.error} (${app.newHealth} days)`,
            );
        }
        await openRemovalPR(thresholdApps);
    }
}

/**
 * Helper: run gh api command and return parsed JSON
 */
function ghApi(endpoint, method, fields) {
    const args = ["api", endpoint, "--method", method];
    for (const [key, value] of Object.entries(fields || {})) {
        args.push("-f", `${key}=${value}`);
    }
    return JSON.parse(execFileSync("gh", args, { encoding: "utf8" }));
}

/**
 * Open a PR removing apps that hit the health threshold.
 *
 * Uses the GitHub API exclusively — no local git checkout or branch switching.
 * This avoids corrupting the working tree during CI, where other workflow steps
 * depend on staying on the default branch.
 */
async function openRemovalPR(thresholdApps) {
    // Check if gh CLI is available and authenticated
    try {
        execFileSync("gh", ["auth", "status"], { stdio: "ignore" });
    } catch {
        console.log(
            `\n${colors.yellow}⚠️  gh CLI not authenticated — skipping PR creation${colors.reset}`,
        );
        console.log(
            "Run with GITHUB_TOKEN or `gh auth login` to enable PR creation.",
        );
        return;
    }

    const today = new Date().toISOString().split("T")[0];
    const branch = `app-health/remove-${today}`;

    // Check if a PR already exists for today
    try {
        const existing = execFileSync(
            "gh",
            [
                "pr",
                "list",
                "--head",
                branch,
                "--json",
                "number",
                "--jq",
                "length",
            ],
            { encoding: "utf8" },
        ).trim();
        if (existing !== "0") {
            console.log(
                `\n${colors.yellow}PR already exists for ${branch} — skipping${colors.reset}`,
            );
            return;
        }
    } catch {
        // gh pr list failed, continue anyway
    }

    // Re-read APPS.md from disk (has updated counters written by healthUpdate)
    const freshContent = fs.readFileSync(APPS_FILE, "utf8");
    const freshLines = freshContent.split("\n");

    // Remove threshold app rows
    const lineIndicesToRemove = new Set(thresholdApps.map((a) => a.lineIndex));
    const newLines = freshLines.filter(
        (_, idx) => !lineIndicesToRemove.has(idx),
    );

    // Build PR body
    let body = `## Stale App Removal — ${today}\n\n`;
    body += `These apps have failed health checks for **${HEALTH_THRESHOLD}+ consecutive days** and are proposed for removal.\n\n`;
    body += `| App | URL | Error | Days Broken | Author | Submitted |\n`;
    body += `|-----|-----|-------|-------------|--------|-----------|\n`;
    for (const app of thresholdApps) {
        body += `| ${app.name} | ${app.urlChecked || "none"} | ${app.error} | ${app.newHealth} | ${app.github} | ${app.submittedDate} |\n`;
    }
    body += `\n**Review each app before merging.** Close this PR to keep all apps.\n`;

    const title = `chore: remove ${thresholdApps.length} stale apps (${today})`;

    // Get repo info from gh
    const repoJson = JSON.parse(
        execFileSync("gh", ["repo", "view", "--json", "owner,name"], {
            encoding: "utf8",
        }),
    );
    const owner = repoJson.owner.login;
    const repo = repoJson.name;

    try {
        // 1. Get the SHA of the default branch HEAD
        const refData = ghApi(
            `repos/${owner}/${repo}/git/ref/heads/main`,
            "GET",
        );
        const baseSha = refData.object.sha;

        // 2. Create the branch ref via API
        ghApi(`repos/${owner}/${repo}/git/refs`, "POST", {
            ref: `refs/heads/${branch}`,
            sha: baseSha,
        });

        // 3. Update APPS.md on the new branch via the Contents API
        //    First get the current file SHA (needed for update)
        const fileData = ghApi(
            `repos/${owner}/${repo}/contents/${APPS_FILE}?ref=${branch}`,
            "GET",
        );

        // Update file content (Contents API accepts base64)
        const newContent = Buffer.from(newLines.join("\n")).toString("base64");
        const updateArgs = [
            "api",
            `repos/${owner}/${repo}/contents/${APPS_FILE}`,
            "--method",
            "PUT",
            "-f",
            `message=${title}`,
            "-f",
            `content=${newContent}`,
            "-f",
            `sha=${fileData.sha}`,
            "-f",
            `branch=${branch}`,
        ];
        execFileSync("gh", updateArgs, { encoding: "utf8" });

        // 4. Create the PR
        const prArgs = [
            "pr",
            "create",
            "--head",
            branch,
            "--title",
            title,
            "--body",
            body,
        ];
        const prUrl = execFileSync("gh", prArgs, { encoding: "utf8" }).trim();

        console.log(`\n${colors.green}✅ PR created: ${prUrl}${colors.reset}`);
    } catch (err) {
        console.error(
            `${colors.red}Error creating PR: ${err.message}${colors.reset}`,
        );
    }
}

// Run
if (shouldHealthUpdate) {
    healthUpdate()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error(
                `${colors.red}Fatal error: ${err.message}${colors.reset}`,
            );
            process.exit(1);
        });
} else {
    main()
        .then((brokenCount) => process.exit(brokenCount > 0 ? 1 : 0))
        .catch((err) => {
            console.error(
                `${colors.red}Fatal error: ${err.message}${colors.reset}`,
            );
            process.exit(1);
        });
}
