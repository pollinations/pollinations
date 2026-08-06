#!/usr/bin/env node

const { CATALOG_FILE, readApps } = require("./lib/app-catalog.js");

const apps = readApps();
console.log(`Validated ${apps.length} apps in ${CATALOG_FILE}`);
