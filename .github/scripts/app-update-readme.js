#!/usr/bin/env node

/**
 * Update README.md with the last 10 apps from apps/APPS.md
 *
 * Usage: node apps_update_readme.js
 */

const fs = require("fs");

const appsFile = "apps/APPS.md";
const readmeFile = "README.md";

// Read apps
const appsContent = fs.readFileSync(appsFile, "utf8");
const lines = appsContent.split("\n");

// Find data rows (after header and separator)
const headerIdx = lines.findIndex((l) => l.startsWith("| Emoji"));
if (headerIdx === -1) {
    console.error("Error: Could not find header row in APPS.md");
    process.exit(1);
}

// Parse header to get column positions (like useApps.ts)
const headerCols = lines[headerIdx].split("|").map((c) => c.trim());
headerCols.shift();
headerCols.pop();
const ci = (name) => headerCols.indexOf(name);

const dataRows = lines.slice(headerIdx + 2).filter((l) => l.startsWith("|"));
const last10 = dataRows.slice(0, 10);

// Create simplified table for README (Name, Description, Author only)
const simplifiedRows = last10.map((row) => {
    const cols = row.split("|").map((c) => c.trim());
    // Remove first and last empty strings from split (matches parseApps.ts pattern)
    cols.shift();
    cols.pop();

    const emoji = cols[ci("Emoji")];
    const name = cols[ci("Name")];
    const url = cols[ci("Web_URL")];
    const desc = cols[ci("Description")];
    const github = cols[ci("GitHub_Username")];
    const repo = cols[ci("Github_Repository_URL")];
    const linkUrl = url || repo;
    const nameCell = linkUrl
        ? `[${emoji} ${name}](${linkUrl})`
        : `${emoji} ${name}`;
    const authorCell = github
        ? `[${github}](https://github.com/${github.replace("@", "")})`
        : "";
    return "| " + nameCell + " | " + desc + " | " + authorCell + " |";
});

const recentAppsSection = `## 🆕 Recent Apps

| Name | Description | Author |
|------|-------------|--------|
${simplifiedRows.join("\n")}

[View all apps →](apps/APPS.md)`;

// Update README
let readme = fs.readFileSync(readmeFile, "utf8");
const marker = "## 🆕 Recent Apps";
const startIdx = readme.indexOf(marker);

if (startIdx !== -1) {
    // Find next ## heading or end
    const afterMarker = readme.substring(startIdx + marker.length);
    const nextSection = afterMarker.search(/\n## /);
    const endIdx =
        nextSection !== -1
            ? startIdx + marker.length + nextSection
            : readme.length;
    readme =
        readme.substring(0, startIdx) +
        recentAppsSection +
        readme.substring(endIdx);
} else {
    // Add before first ## heading after title
    const firstHeading = readme.search(/\n## /);
    if (firstHeading !== -1) {
        readme =
            readme.substring(0, firstHeading) +
            "\n\n" +
            recentAppsSection +
            readme.substring(firstHeading);
    }
}

fs.writeFileSync(readmeFile, readme);
console.log("✅ Updated README.md with last 10 apps");
