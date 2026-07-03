#!/usr/bin/env node

/**
 * Prepend a new app entry to apps/APPS.md
 *
 * Usage: node .github/scripts/app-prepend-row.js
 *
 * Environment variables:
 *   NEW_ROW - The markdown table row to prepend
 */

const fs = require("fs");
const { APPS_FILE, parseApps } = require("./lib/parse-apps.js");

const newRow = process.env.NEW_ROW;

if (!newRow) {
    console.error("Error: NEW_ROW environment variable is required");
    process.exit(1);
}

const { lines, headerIdx } = parseApps();

// Insert new row right after the header separator
lines.splice(headerIdx + 2, 0, newRow);
fs.writeFileSync(APPS_FILE, lines.join("\n"));

console.log("✅ Prepended new entry to apps/APPS.md");
