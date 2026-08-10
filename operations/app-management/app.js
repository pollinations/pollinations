#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const APP_FILE = path.resolve(__dirname, "app.json");

const REQUIRED_STRING_FIELDS = [
    "emoji",
    "name",
    "description",
    "category",
    "platform",
];
const NULLABLE_STRING_FIELDS = [
    "url",
    "language",
    "githubUsername",
    "githubUserId",
    "repositoryUrl",
    "discordUsername",
    "other",
    "submittedDate",
    "issueUrl",
    "approvedDate",
];
const OPTIONAL_NULLABLE_STRING_FIELDS = ["screenshotUrl"];
const SCREENSHOT_URL_PATTERN =
    /^https:\/\/media\.pollinations\.ai\/[^/?#\s][^\s]*$/;
const REQUIRED_FIELDS = new Set([
    ...REQUIRED_STRING_FIELDS,
    ...NULLABLE_STRING_FIELDS,
    "repositoryStars",
    "byop",
    "requests24h",
]);
const CATALOG_FIELDS = new Set([
    ...REQUIRED_FIELDS,
    ...OPTIONAL_NULLABLE_STRING_FIELDS,
]);

function validateApps(apps, filePath = APP_FILE) {
    if (!Array.isArray(apps))
        throw new Error(`${filePath} must contain an array`);

    for (const [index, app] of apps.entries()) {
        const label = `${filePath}[${index}]`;
        if (!app || typeof app !== "object" || Array.isArray(app)) {
            throw new Error(`${label} must be an object`);
        }

        for (const field of Object.keys(app)) {
            if (!CATALOG_FIELDS.has(field)) {
                throw new Error(`${label}.${field} is not a catalog field`);
            }
        }
        for (const field of REQUIRED_FIELDS) {
            if (!(field in app)) {
                throw new Error(`${label}.${field} is required`);
            }
        }
        for (const field of REQUIRED_STRING_FIELDS) {
            if (typeof app[field] !== "string" || !app[field].trim()) {
                throw new Error(`${label}.${field} must be a non-empty string`);
            }
        }
        for (const field of [
            ...NULLABLE_STRING_FIELDS,
            ...OPTIONAL_NULLABLE_STRING_FIELDS,
        ]) {
            if (!(field in app)) continue;
            if (
                app[field] !== null &&
                (typeof app[field] !== "string" || !app[field].trim())
            ) {
                throw new Error(
                    `${label}.${field} must be null or a non-empty string`,
                );
            }
        }
        if (
            app.screenshotUrl &&
            !SCREENSHOT_URL_PATTERN.test(app.screenshotUrl)
        ) {
            throw new Error(
                `${label}.screenshotUrl must use https://media.pollinations.ai/`,
            );
        }
        if (
            app.repositoryStars !== null &&
            (!Number.isInteger(app.repositoryStars) || app.repositoryStars < 0)
        ) {
            throw new Error(
                `${label}.repositoryStars must be null or a non-negative integer`,
            );
        }
        if (typeof app.byop !== "boolean") {
            throw new Error(`${label}.byop must be a boolean`);
        }
        if (!Number.isInteger(app.requests24h) || app.requests24h < 0) {
            throw new Error(
                `${label}.requests24h must be a non-negative integer`,
            );
        }
    }

    return apps;
}

function readApps(filePath = APP_FILE) {
    const apps = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return validateApps(apps, filePath);
}

function writeApps(apps, filePath = APP_FILE) {
    validateApps(apps, filePath);
    fs.writeFileSync(filePath, `${JSON.stringify(apps, null, 2)}\n`);
}

function prependApp(app, filePath = APP_FILE) {
    const apps = readApps(filePath);
    writeApps([app, ...apps], filePath);
}

function main() {
    const command = process.argv[2];
    if (command === "validate") {
        const apps = readApps();
        console.log(`Validated ${apps.length} apps in ${APP_FILE}`);
        return;
    }
    if (command === "prepend") {
        if (!process.env.NEW_APP) {
            throw new Error("NEW_APP environment variable is required");
        }
        prependApp(JSON.parse(process.env.NEW_APP));
        console.log(
            "Prepended new entry to operations/app-management/app.json",
        );
        return;
    }
    throw new Error("Expected validate or prepend command");
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    }
}

module.exports = {
    APP_FILE,
    prependApp,
    readApps,
    validateApps,
    writeApps,
};
