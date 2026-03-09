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

const dataRows = lines.slice(headerIdx + 2).filter((l) => l.startsWith("|"));
const last10 = dataRows.slice(0, 10);

// Known platform values that may appear at col 6 in some rows
const PLATFORMS = new Set([
    "web",
    "android",
    "ios",
    "windows",
    "macos",
    "desktop",
    "cli",
    "discord",
    "telegram",
    "whatsapp",
    "library",
    "browser-ext",
    "roblox",
    "wordpress",
    "api",
]);

// Create simplified table for README (Name, Description, Author only)
const simplifiedRows = last10.map((row) => {
    const cols = row.split("|").map((c) => c.trim());
    cols.shift();
    cols.pop();
    const emoji = cols[0];
    const name = cols[1];
    const url = cols[2];
    const desc = cols[3];
    // Some rows include a Platform value at col 6 (shifting GitHub columns right by 1).
    const hasPlatform = PLATFORMS.has(cols[6]?.toLowerCase());
    const github = cols[hasPlatform ? 7 : 6];
    const nameCell = url ? `[${emoji} ${name}](${url})` : `${emoji} ${name}`;
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
