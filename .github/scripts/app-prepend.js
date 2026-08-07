#!/usr/bin/env node

/**
 * Prepend a new app entry to apps/catalog.json
 *
 * Usage: node .github/scripts/app-prepend.js
 *
 * Environment variables:
 *   NEW_APP - The app object as compact JSON
 */

const { readApps, writeApps } = require("./lib/app-catalog.js");

const newApp = process.env.NEW_APP;

if (!newApp) {
    console.error("Error: NEW_APP environment variable is required");
    process.exit(1);
}

const apps = readApps();
apps.unshift(JSON.parse(newApp));
writeApps(apps);

console.log("✅ Prepended new entry to apps/catalog.json");
