/**
 * Shared parser for the apps/APPS.md markdown table.
 *
 * Single source of truth for "find the | Emoji header row, split data rows
 * on |, map columns to fields". Fields are resolved by header name (not by
 * hard-coded index), so column reorders don't silently corrupt consumers.
 *
 * Note: pollinations.ai/src/hooks/useApps.ts has its own browser-side copy
 * of this logic (different runtime); keep field mappings in sync.
 */

const fs = require("node:fs");
const path = require("node:path");

const APPS_FILE = path.resolve(__dirname, "../../../apps/APPS.md");

// Canonical field name → APPS.md header name.
const FIELD_TO_HEADER = {
    emoji: "Emoji",
    name: "Name",
    webUrl: "Web_URL",
    description: "Description",
    language: "Language",
    category: "Category",
    platform: "Platform",
    githubUsername: "GitHub_Username",
    githubUserId: "GitHub_UserID",
    repoUrl: "Github_Repository_URL",
    stars: "Github_Repository_Stars",
    discord: "Discord_Username",
    other: "Other",
    submittedDate: "Submitted_Date",
    issueUrl: "Issue_URL",
    approvedDate: "Approved_Date",
    byop: "BYOP",
    requests24h: "Requests_24h",
};

/** Split a markdown table row into trimmed cells (drops the outer empties). */
function splitRow(line) {
    const cells = line.split("|").map((c) => c.trim());
    cells.shift();
    cells.pop();
    return cells;
}

/**
 * Parse APPS.md into { lines, headerIdx, apps }.
 *
 * Each app has every canonical field as a raw trimmed string ("" when the
 * column is missing or empty) plus `lineIndex` (index into `lines`) for
 * consumers that rewrite rows in place.
 */
function parseApps(filePath = APPS_FILE) {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");

    const headerIdx = lines.findIndex((l) => l.startsWith("| Emoji"));
    if (headerIdx === -1) {
        throw new Error(`Could not find header row in ${filePath}`);
    }

    const headers = splitRow(lines[headerIdx]);
    const fieldIdx = {};
    for (const [field, header] of Object.entries(FIELD_TO_HEADER)) {
        fieldIdx[field] = headers.findIndex(
            (h) => h.toLowerCase() === header.toLowerCase(),
        );
    }

    const apps = [];
    for (let i = headerIdx + 2; i < lines.length; i++) {
        const line = lines[i];
        if (!line.startsWith("|")) continue;

        const cells = splitRow(line);
        if (cells.length < 15) continue;

        const app = { lineIndex: i };
        for (const [field, idx] of Object.entries(fieldIdx)) {
            app[field] = idx !== -1 && idx < cells.length ? cells[idx] : "";
        }
        apps.push(app);
    }

    return { lines, headerIdx, apps };
}

/**
 * Rewrite one field's cell in a data row in place, preserving the
 * `| value |` padding convention. Throws if the column is missing.
 */
function setCell(lines, headerIdx, lineIndex, field, value) {
    const header = FIELD_TO_HEADER[field];
    // Raw split (no shift/pop) so the header position maps 1:1 onto the
    // raw row split used for the rewrite.
    const headers = lines[headerIdx].split("|").map((h) => h.trim());
    const idx = headers.findIndex(
        (h) => h.toLowerCase() === header.toLowerCase(),
    );
    if (idx === -1) {
        throw new Error(`Column "${header}" not found in APPS.md header`);
    }
    const cols = lines[lineIndex].split("|");
    cols[idx] = ` ${value} `;
    lines[lineIndex] = cols.join("|");
}

module.exports = { APPS_FILE, parseApps, setCell, splitRow };
