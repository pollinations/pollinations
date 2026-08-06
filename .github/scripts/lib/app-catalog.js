const fs = require("node:fs");
const path = require("node:path");

const CATALOG_FILE = path.resolve(__dirname, "../../../apps/catalog.json");

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
const CATALOG_FIELDS = new Set([
    ...REQUIRED_STRING_FIELDS,
    ...NULLABLE_STRING_FIELDS,
    "repositoryStars",
    "byop",
    "requests24h",
]);

function validateApps(apps, filePath = CATALOG_FILE) {
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
        for (const field of CATALOG_FIELDS) {
            if (!(field in app)) {
                throw new Error(`${label}.${field} is required`);
            }
        }
        for (const field of REQUIRED_STRING_FIELDS) {
            if (typeof app[field] !== "string" || !app[field].trim()) {
                throw new Error(`${label}.${field} must be a non-empty string`);
            }
        }
        for (const field of NULLABLE_STRING_FIELDS) {
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

function readApps(filePath = CATALOG_FILE) {
    const apps = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return validateApps(apps, filePath);
}

function writeApps(apps, filePath = CATALOG_FILE) {
    validateApps(apps, filePath);
    fs.writeFileSync(filePath, `${JSON.stringify(apps, null, 2)}\n`);
}

module.exports = { CATALOG_FILE, readApps, validateApps, writeApps };
