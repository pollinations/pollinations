#!/usr/bin/env node

/**
 * Check all app links in apps/APPS.md and report broken ones
 *
 * Usage: node .github/scripts/tier-apps-check-links.js [options]
 *
 * Options:
 *   --timeout=<ms>    Set timeout in milliseconds (default: 10000)
 *   --category=<name> Check only specific category
 *   --verbose         Show detailed output
 *   --update          Update APPS.md with status (adds ❌ to broken apps)
 *   --report          Generate BROKEN_APPS.md report
 */

const fs = require("fs");
const https = require("https");
const http = require("http");

const APPS_FILE = "apps/APPS.md";
const REPORT_FILE = "apps/BROKEN_APPS.md";
const DEFAULT_TIMEOUT = 10000;

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

    const apps = [];
    const dataRows = lines
        .slice(headerIdx + 2)
        .filter((l) => l.startsWith("|"));

    for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const cols = row
            .split("|")
            .map((c) => c.trim())
            .filter(Boolean);

        if (cols.length < 11) continue;

        // Format: Emoji | Name | Description | Language | Category | GitHub | Repo | Stars | Discord | Other | Submitted
        const nameMatch = cols[1].match(/\[([^\]]+)\]\(([^)]+)\)/);
        const name = nameMatch ? nameMatch[1] : cols[1];
        const url = nameMatch ? nameMatch[2] : "";

        apps.push({
            lineIndex: headerIdx + 2 + i,
            emoji: cols[0],
            name,
            url,
            description: cols[2],
            language: cols[3],
            category: cols[4].toLowerCase(),
            github: cols[5],
            repo: cols[6],
            stars: cols[7],
            discord: cols[8],
            other: cols[9],
            submitted: cols[10],
            rawLine: row,
        });
    }

    return { apps, lines, headerIdx };
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
                headers: { "User-Agent": "pollinations-link-checker/1.0" },
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
            console.log(`  Submitted: ${app.submitted}`);
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
        report += `| ${app.name} | ${app.url} | ${status} | ${app.category} | ${app.submitted} |\n`;
    }

    report += `\n## Actions

- Review each broken app and determine if it should be removed or updated
- Contact app authors via Discord or GitHub if available
- Remove apps that have been broken for more than 30 days
`;

    return report;
}

// Run
main()
    .then((brokenCount) => process.exit(brokenCount > 0 ? 1 : 0))
    .catch((err) => {
        console.error(
            `${colors.red}Fatal error: ${err.message}${colors.reset}`,
        );
        process.exit(1);
    });
