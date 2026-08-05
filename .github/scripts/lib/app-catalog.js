const fs = require("node:fs");
const path = require("node:path");

const CATALOG_FILE = path.resolve(__dirname, "../../../apps/apps.json");

function readApps(filePath = CATALOG_FILE) {
    const apps = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!Array.isArray(apps))
        throw new Error(`${filePath} must contain an array`);
    return apps;
}

function writeApps(apps, filePath = CATALOG_FILE) {
    fs.writeFileSync(filePath, `${JSON.stringify(apps, null, 2)}\n`);
}

module.exports = { CATALOG_FILE, readApps, writeApps };
