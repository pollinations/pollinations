#!/usr/bin/env node

/**
 * Script to analyze broken links report and generate actionable insights
 *
 * This script reads the broken-links-report.json file and provides:
 * - Summary statistics
 * - Breakdown by category
 * - Breakdown by error type
 * - List of projects that need attention
 * - Suggestions for cleanup
 */

import fs from "fs/promises";
import path from "path";

// Colors for console output
const colors = {
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    reset: "\x1b[0m",
    bold: "\x1b[1m",
};

async function analyzeBrokenLinks() {
    try {
        const reportPath = path.join(process.cwd(), "broken-links-report.json");
        const reportData = JSON.parse(await fs.readFile(reportPath, "utf8"));

        console.log(
            `${colors.bold}📊 Broken Links Analysis Report${colors.reset}`,
        );
        console.log(
            `Generated: ${new Date(reportData.timestamp).toLocaleString()}\n`,
        );

        // Overall statistics
        console.log(`${colors.bold}📈 Overall Statistics${colors.reset}`);
        console.log(`Total URLs checked: ${reportData.totalChecked}`);
        console.log(
            `Broken links found: ${colors.red}${reportData.brokenCount}${colors.reset}`,
        );
        console.log(
            `Success rate: ${colors.green}${(((reportData.totalChecked - reportData.brokenCount) / reportData.totalChecked) * 100).toFixed(1)}%${colors.reset}`,
        );
        console.log(
            `Failure rate: ${colors.red}${((reportData.brokenCount / reportData.totalChecked) * 100).toFixed(1)}%${colors.reset}\n`,
        );

        // Breakdown by category
        const byCategory = {};
        const byErrorType = {};
        const byProject = {};

        for (const link of reportData.brokenLinks) {
            // By category
            if (!byCategory[link.category]) {
                byCategory[link.category] = [];
            }
            byCategory[link.category].push(link);

            // By error type
            const errorKey =
                link.status === 404
                    ? "404 Not Found"
                    : link.status >= 500
                      ? "Server Error (5xx)"
                      : link.status >= 400
                        ? "Client Error (4xx)"
                        : link.error === "Timeout"
                          ? "Timeout"
                          : link.error
                            ? "Connection Error"
                            : "Unknown";

            if (!byErrorType[errorKey]) {
                byErrorType[errorKey] = [];
            }
            byErrorType[errorKey].push(link);

            // By project
            if (!byProject[link.project]) {
                byProject[link.project] = [];
            }
            byProject[link.project].push(link);
        }

        // Display category breakdown
        console.log(`${colors.bold}📂 Breakdown by Category${colors.reset}`);
        const sortedCategories = Object.entries(byCategory).sort(
            (a, b) => b[1].length - a[1].length,
        );
        for (const [category, links] of sortedCategories) {
            console.log(
                `${colors.yellow}${category}${colors.reset}: ${colors.red}${links.length}${colors.reset} broken links`,
            );
        }
        console.log("");

        // Display error type breakdown
        console.log(`${colors.bold}🚨 Breakdown by Error Type${colors.reset}`);
        const sortedErrors = Object.entries(byErrorType).sort(
            (a, b) => b[1].length - a[1].length,
        );
        for (const [errorType, links] of sortedErrors) {
            const color =
                errorType === "404 Not Found"
                    ? colors.red
                    : errorType.includes("Server Error")
                      ? colors.yellow
                      : errorType === "Timeout"
                        ? colors.cyan
                        : colors.magenta;
            console.log(
                `${color}${errorType}${colors.reset}: ${links.length} links`,
            );
        }
        console.log("");

        // Projects with multiple broken links
        console.log(
            `${colors.bold}🔥 Projects with Multiple Broken Links${colors.reset}`,
        );
        const multipleIssues = Object.entries(byProject)
            .filter(([project, links]) => links.length > 1)
            .sort((a, b) => b[1].length - a[1].length);

        if (multipleIssues.length > 0) {
            for (const [project, links] of multipleIssues) {
                console.log(
                    `${colors.red}● ${project}${colors.reset} (${links.length} broken links)`,
                );
                for (const link of links) {
                    console.log(
                        `  ${link.type}: ${link.url} - ${link.status || "Error"}`,
                    );
                }
                console.log("");
            }
        } else {
            console.log(
                `${colors.green}No projects with multiple broken links${colors.reset}\n`,
            );
        }

        // GitHub repositories that are 404
        console.log(
            `${colors.bold}📦 Missing GitHub Repositories${colors.reset}`,
        );
        const missing404Repos = reportData.brokenLinks.filter(
            (link) => link.type === "Repository" && link.status === 404,
        );

        if (missing404Repos.length > 0) {
            console.log(
                `Found ${colors.red}${missing404Repos.length}${colors.reset} missing GitHub repositories:\n`,
            );
            for (const repo of missing404Repos) {
                console.log(
                    `${colors.red}● ${repo.project}${colors.reset} (${repo.category})`,
                );
                console.log(`  ${repo.url}`);
            }
            console.log("");
        }

        // Main URLs that are completely down
        console.log(
            `${colors.bold}🌐 Completely Broken Main URLs${colors.reset}`,
        );
        const brokenMainUrls = reportData.brokenLinks.filter(
            (link) =>
                link.type === "Main URL" && (link.status === 404 || link.error),
        );

        if (brokenMainUrls.length > 0) {
            console.log(
                `Found ${colors.red}${brokenMainUrls.length}${colors.reset} completely broken main URLs:\n`,
            );
            for (const url of brokenMainUrls) {
                console.log(
                    `${colors.red}● ${url.project}${colors.reset} (${url.category})`,
                );
                console.log(`  ${url.url} - ${url.status || url.error}`);
            }
            console.log("");
        }

        // Recommendations
        console.log(`${colors.bold}💡 Recommendations${colors.reset}`);
        console.log(
            `${colors.yellow}1. High Priority:${colors.reset} Fix ${missing404Repos.length} missing GitHub repositories`,
        );
        console.log(
            `${colors.yellow}2. Medium Priority:${colors.reset} Contact maintainers of ${brokenMainUrls.length} broken main URLs`,
        );
        console.log(
            `${colors.yellow}3. Low Priority:${colors.reset} Review ${byErrorType["Timeout"]?.length || 0} timeout issues (may be temporary)`,
        );
        console.log(
            `${colors.yellow}4. Consider:${colors.reset} Removing projects with both broken main URL and repository`,
        );

        const totallyBroken = Object.entries(byProject).filter(
            ([project, links]) => {
                const hasMainUrl = links.some((l) => l.type === "Main URL");
                const hasRepo = links.some((l) => l.type === "Repository");
                return hasMainUrl && hasRepo && links.length >= 2;
            },
        );

        if (totallyBroken.length > 0) {
            console.log(
                `\n${colors.red}⚠️  Projects with both main URL and repository broken (consider removal):${colors.reset}`,
            );
            for (const [project, links] of totallyBroken) {
                console.log(`   • ${project} (${links[0].category})`);
            }
        }

        console.log(
            `\n${colors.green}✅ Analysis complete! Check the detailed report in broken-links-report.json${colors.reset}`,
        );
    } catch (error) {
        console.error(
            `${colors.red}Error reading broken links report: ${error.message}${colors.reset}`,
        );
        console.log(
            `${colors.yellow}Make sure to run 'node check-project-links.js' first to generate the report.${colors.reset}`,
        );
    }
}

analyzeBrokenLinks();
