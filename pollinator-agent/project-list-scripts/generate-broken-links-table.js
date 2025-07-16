#!/usr/bin/env node

/**
 * Script to generate a markdown table of broken links from the report
 *
 * This script reads the broken-links-report.json file and generates
 * a well-formatted markdown table for documentation purposes.
 */

import fs from "fs/promises";
import path from "path";

async function generateBrokenLinksTable() {
    try {
        const reportPath = path.join(process.cwd(), "broken-links-report.json");
        const reportData = JSON.parse(await fs.readFile(reportPath, "utf8"));

        // Sort broken links by category, then by project name
        const sortedLinks = reportData.brokenLinks.sort((a, b) => {
            if (a.category !== b.category) {
                return a.category.localeCompare(b.category);
            }
            return a.project.localeCompare(b.project);
        });

        // Generate markdown content
        let markdown = `# 🚨 Broken Project Links Report

> **Generated:** ${new Date(reportData.timestamp).toLocaleString()}  
> **Total URLs Checked:** ${reportData.totalChecked}  
> **Broken Links Found:** ${reportData.brokenCount} (${((reportData.brokenCount / reportData.totalChecked) * 100).toFixed(1)}%)

This report identifies broken links in the Pollinations projects showcase that need attention.

## 📊 Summary by Category

`;

        // Generate category summary
        const byCategory = {};
        for (const link of sortedLinks) {
            if (!byCategory[link.category]) {
                byCategory[link.category] = [];
            }
            byCategory[link.category].push(link);
        }

        const categoryOrder = [
            "vibeCoding",
            "creative",
            "games",
            "hackAndBuild",
            "chat",
            "socialBots",
            "learn",
        ];
        for (const category of categoryOrder) {
            if (byCategory[category]) {
                const categoryTitle = getCategoryTitle(category);
                markdown += `- **${categoryTitle}**: ${byCategory[category].length} broken links\n`;
            }
        }

        markdown += `\n## 📋 Detailed Broken Links

| Category | Project | Link Type | URL | Status | Error |
|----------|---------|-----------|-----|--------|-------|
`;

        // Add each broken link to the table
        for (const link of sortedLinks) {
            const categoryTitle = getCategoryTitle(link.category);
            const status = link.status || "Error";
            const error = link.error || link.statusText || "Unknown";
            const linkType = link.type === "Repository" ? "📦 Repo" : "🌐 Main";

            // Escape pipe characters in URLs and errors for markdown table
            const escapedUrl = link.url.replace(/\|/g, "\\|");
            const escapedError = error.replace(/\|/g, "\\|");

            markdown += `| ${categoryTitle} | ${link.project} | ${linkType} | ${escapedUrl} | ${status} | ${escapedError} |\n`;
        }

        // Add recommendations section
        markdown += `\n## 💡 Recommendations

### 🔴 High Priority (Remove or Fix Immediately)

**Projects with both main URL and repository broken:**
`;

        // Find projects with multiple broken links
        const byProject = {};
        for (const link of sortedLinks) {
            if (!byProject[link.project]) {
                byProject[link.project] = [];
            }
            byProject[link.project].push(link);
        }

        const totallyBroken = Object.entries(byProject).filter(
            ([project, links]) => {
                const hasMainUrl = links.some((l) => l.type === "Main URL");
                const hasRepo = links.some((l) => l.type === "Repository");
                return hasMainUrl && hasRepo && links.length >= 2;
            },
        );

        if (totallyBroken.length > 0) {
            for (const [project, links] of totallyBroken) {
                const category = getCategoryTitle(links[0].category);
                markdown += `- **${project}** (${category}) - Consider removing from showcase\n`;
            }
        } else {
            markdown += `- None found\n`;
        }

        markdown += `\n### 🟡 Medium Priority (Contact Maintainers)

**Missing GitHub repositories (404 errors):**
`;

        const missing404Repos = sortedLinks.filter(
            (link) => link.type === "Repository" && link.status === 404,
        );

        if (missing404Repos.length > 0) {
            for (const repo of missing404Repos) {
                const category = getCategoryTitle(repo.category);
                markdown += `- **${repo.project}** (${category}) - ${repo.url}\n`;
            }
        } else {
            markdown += `- None found\n`;
        }

        markdown += `\n**Broken main URLs:**
`;

        const brokenMainUrls = sortedLinks.filter(
            (link) =>
                link.type === "Main URL" && (link.status === 404 || link.error),
        );

        if (brokenMainUrls.length > 0) {
            for (const url of brokenMainUrls.slice(0, 10)) {
                // Show first 10
                const category = getCategoryTitle(url.category);
                markdown += `- **${url.project}** (${category}) - ${url.status || url.error}\n`;
            }
            if (brokenMainUrls.length > 10) {
                markdown += `- ... and ${brokenMainUrls.length - 10} more\n`;
            }
        } else {
            markdown += `- None found\n`;
        }

        markdown += `\n### 🔵 Low Priority (Monitor)

**Timeout issues (may be temporary):**
`;

        const timeouts = sortedLinks.filter((link) => link.error === "Timeout");
        if (timeouts.length > 0) {
            for (const timeout of timeouts) {
                const category = getCategoryTitle(timeout.category);
                markdown += `- **${timeout.project}** (${category}) - ${timeout.url}\n`;
            }
        } else {
            markdown += `- None found\n`;
        }

        markdown += `\n## 🔄 How to Update This Report

To regenerate this report with current data:

\`\`\`bash
cd pollinator-agent
node check-project-links.js
node generate-broken-links-table.js
\`\`\`

## 📁 Related Files

- [\`broken-links-report.json\`](./broken-links-report.json) - Raw data from link checker
- [\`check-project-links.js\`](./check-project-links.js) - Link checking script
- [\`analyze-broken-links.js\`](./analyze-broken-links.js) - Analysis script
- [\`../pollinations.ai/src/config/projectList.js\`](../pollinations.ai/src/config/projectList.js) - Source project data
`;

        return markdown;
    } catch (error) {
        console.error(`Error generating broken links table: ${error.message}`);
        return null;
    }
}

function getCategoryTitle(categoryKey) {
    const titles = {
        vibeCoding: "Vibe Coding ✨",
        creative: "Creative 🎨",
        games: "Games 🎲",
        hackAndBuild: "Hack-&-Build 🛠️",
        chat: "Chat 💬",
        socialBots: "Social Bots 🤖",
        learn: "Learn 📚",
    };
    return titles[categoryKey] || categoryKey;
}

// Generate and save the markdown table
generateBrokenLinksTable()
    .then((markdown) => {
        if (markdown) {
            // Save to the main pollinations repo for visibility
            const outputPath = path.join(
                process.cwd(),
                "..",
                "BROKEN_LINKS.md",
            );
            return fs.writeFile(outputPath, markdown);
        }
    })
    .then(() => {
        console.log("✅ Broken links table generated: ../BROKEN_LINKS.md");
    })
    .catch((error) => {
        console.error("❌ Error:", error.message);
    });
