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
 *   --update          Update APPS.md with status (adds ❌ to broken apps)
 *   --report          Generate BROKEN_APPS.md report
 *   --health-update   Track daily health: increment failure counters, open removal PR at threshold
 */

const fs = require("fs");
const https = require("https");
const http = require("http");
const { execSync } = require("child_process");

const APPS_FILE = "apps/APPS.md";
const REPORT_FILE = "apps/BROKEN_APPS.md";
const DEFAULT_TIMEOUT = 10000;
const HEALTH_THRESHOLD = 7;

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
const shouldUpdate = args.includes("--update");
const shouldReport = args.includes("--report");
const timeoutArg = args.find((a) => a.startsWith("--timeout="));
const timeout = timeoutArg
    ? parseInt(timeoutArg.split("=")[1])
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
            healthColIdx >= 0 ? parseInt(cols[healthColIdx]) || 0 : 0;

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

    const { apps, lines } = parseAppsMarkdown();

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
 * Health update mode: track daily failures and open removal PR at threshold
 */
async function healthUpdate() {
    console.log(`${colors.bold}🏥 Health Update Mode${colors.reset}\n`);

    const { apps, lines, healthColIdx } = parseAppsMarkdown();

    if (healthColIdx < 0) {
        console.error("Error: Health column not found in APPS.md header");
        process.exit(1);
    }

    // +1 because lines.split("|") without slice has leading empty string
    const writeColIdx = healthColIdx + 1;

    console.log(`Checking ${apps.length} apps...\n`);

    const changes = [];
    const thresholdApps = [];

    for (let i = 0; i < apps.length; i++) {
        const app = apps[i];

        if (verbose) {
            console.log(
                `[${i + 1}/${apps.length}] ${app.name} (health: ${app.currentHealth})`,
            );
        } else {
            process.stdout.write(
                `\rProgress: ${i + 1}/${apps.length} (${Math.round(((i + 1) / apps.length) * 100)}%)`,
            );
        }

        // Determine which URL to check
        const urlToCheck =
            app.url && app.url.startsWith("http")
                ? app.url
                : app.repo && app.repo.startsWith("http")
                  ? app.repo
                  : null;

        let result;
        if (!urlToCheck) {
            result = { status: "skip", reason: "No URL" };
        } else {
            result = await checkUrl(urlToCheck);
        }

        const classification = classifyResult(urlToCheck, result);
        let newHealth;

        if (classification === "skip" || classification === "healthy") {
            newHealth = 0;
        } else {
            newHealth = app.currentHealth + 1;
        }

        if (verbose) {
            const icon =
                classification === "healthy"
                    ? "✅"
                    : classification === "skip"
                      ? "⏭️"
                      : "❌";
            console.log(
                `  ${icon} ${urlToCheck || "no URL"} → ${classification}${newHealth > 0 ? ` (${newHealth} days)` : ""}`,
            );
        }

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

        // Collect apps that just hit or are past threshold
        if (newHealth >= HEALTH_THRESHOLD) {
            thresholdApps.push({
                ...app,
                newHealth,
                urlChecked: urlToCheck,
                error: formatError(result),
            });
        }

        await new Promise((r) => setTimeout(r, 100));
    }

    if (!verbose) console.log("\n");

    // Write updated health counters back to APPS.md
    if (changes.length > 0) {
        fs.writeFileSync(APPS_FILE, lines.join("\n"));
        console.log(
            `${colors.green}Updated ${changes.length} health counters${colors.reset}`,
        );
    } else {
        console.log("No health changes.");
    }

    // Summary
    const failing = apps.filter((a, idx) => {
        const cols = lines[a.lineIndex].split("|");
        const h = parseInt(cols[writeColIdx]) || 0;
        return h > 0;
    });
    console.log(`\n${colors.bold}📊 Health Summary${colors.reset}`);
    console.log(`  Currently failing: ${failing.length} apps`);
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
        await openRemovalPR(thresholdApps, lines, writeColIdx);
    }
}

/**
 * Open a PR removing apps that hit the health threshold
 */
async function openRemovalPR(thresholdApps, lines, writeColIdx) {
    // Check if gh CLI is available and authenticated
    try {
        execSync("gh auth status", { stdio: "ignore" });
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
        const existing = execSync(
            `gh pr list --head "${branch}" --json number --jq length`,
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

    // Remove threshold app rows from APPS.md
    const lineIndicesToRemove = new Set(thresholdApps.map((a) => a.lineIndex));
    const newLines = lines.filter((_, idx) => !lineIndicesToRemove.has(idx));

    // Build PR body
    let body = `## Stale App Removal — ${today}\n\n`;
    body += `These apps have failed health checks for **${HEALTH_THRESHOLD}+ consecutive days** and are proposed for removal.\n\n`;
    body += `| App | URL | Error | Days Broken | Author | Submitted |\n`;
    body += `|-----|-----|-------|-------------|--------|-----------|\n`;
    for (const app of thresholdApps) {
        body += `| ${app.name} | ${app.urlChecked || "none"} | ${app.error} | ${app.newHealth} | ${app.github} | ${app.submittedDate} |\n`;
    }
    body += `\n**Review each app before merging.** Close this PR to keep all apps.\n`;

    // Create branch, write changes, commit, push, open PR
    try {
        execSync(`git checkout -b "${branch}"`, { stdio: "ignore" });
        fs.writeFileSync(APPS_FILE, newLines.join("\n"));
        execSync(`git add "${APPS_FILE}"`, { stdio: "ignore" });
        execSync(
            `git commit -m "chore: remove ${thresholdApps.length} stale apps (${today})"`,
            { stdio: "ignore" },
        );
        execSync(`git push -u origin "${branch}"`, { stdio: "ignore" });

        const prUrl = execSync(
            `gh pr create --title "chore: remove ${thresholdApps.length} stale apps (${today})" --body "${body.replace(/"/g, '\\"')}" --label "app-health"`,
            { encoding: "utf8" },
        ).trim();

        console.log(`\n${colors.green}✅ PR created: ${prUrl}${colors.reset}`);

        // Switch back to previous branch
        execSync("git checkout -", { stdio: "ignore" });
    } catch (err) {
        console.error(
            `${colors.red}Error creating PR: ${err.message}${colors.reset}`,
        );
        // Try to switch back
        try {
            execSync("git checkout -", { stdio: "ignore" });
        } catch {}
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
