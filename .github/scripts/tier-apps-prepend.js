#!/usr/bin/env node

/**
 * Prepend a new app entry to apps/APPS.md
 *
 * Usage: node apps_prepend_entry.js
 *
 * Environment variables:
 *   NEW_ROW - The markdown table row to prepend
 */

const fs = require("fs");

const newRow = process.env.NEW_ROW;

if (!newRow) {
    console.error("Error: NEW_ROW environment variable is required");
    process.exit(1);
}

const appsFile = "apps/APPS.md";
let content = fs.readFileSync(appsFile, "utf8");
const lines = content.split("\n");

// Find the header row (starts with | Emoji)
const headerIdx = lines.findIndex((l) => l.startsWith("| Emoji"));
if (headerIdx === -1) {
    console.error("Error: Could not find header row in APPS.md");
    process.exit(1);
}

const separatorIdx = headerIdx + 1;

// Insert new row after separator
lines.splice(separatorIdx + 1, 0, newRow);
fs.writeFileSync(appsFile, lines.join("\n"));

console.log("✅ Prepended new entry to apps/APPS.md");
