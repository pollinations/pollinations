/**
 * Parser for the apps/APPS.md markdown table.
 *
 * Fields resolve by header NAME, never by column index, so reordering a
 * column can't silently corrupt consumers. This is the fix that the
 * browser-side copy never had — it read `emoji` from `cols[0]`.
 *
 * ⚠️ `.github/scripts/lib/parse-apps.js` still carries its own CommonJS copy
 * of this logic, because six workflows `require()` it with plain `node` and
 * converting them is a separate change. `FIELD_TO_HEADER` must stay in sync
 * between the two until that lands.
 */

/** Canonical field name → APPS.md header name. */
export const FIELD_TO_HEADER = {
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
} as const;

export type AppField = keyof typeof FIELD_TO_HEADER;

/** One row, every field a raw trimmed string ("" when absent). */
export type RawAppRow = Record<AppField, string>;

export type AppRow = Omit<RawAppRow, "stars" | "byop" | "requests24h"> & {
    /** null when the column is empty or unparseable. "⭐1.2k" → 1200. */
    stars: number | null;
    byop: boolean;
    requests24h: number;
};

/** Split a markdown table row into trimmed cells, dropping the outer empties. */
export function splitRow(line: string): string[] {
    const cells = line.split("|").map((cell) => cell.trim());
    cells.shift();
    cells.pop();
    return cells;
}

/** "⭐1.2k" → 1200, "⭐340" → 340, "" → null. */
function parseStars(value: string): number | null {
    const match = value.match(/([\d.]+)\s*([km])?/i);
    if (!match) return null;
    let stars = Number.parseFloat(match[1]);
    if (Number.isNaN(stars)) return null;
    const suffix = match[2]?.toLowerCase();
    if (suffix === "k") stars *= 1_000;
    if (suffix === "m") stars *= 1_000_000;
    return Math.round(stars);
}

function parseFlag(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "yes" || normalized === "✅";
}

export function parseAppsTable(markdown: string): AppRow[] {
    const lines = markdown.split("\n");
    const headerIdx = lines.findIndex((line) => line.startsWith("| Emoji"));
    if (headerIdx === -1) return [];

    const headers = splitRow(lines[headerIdx]);
    const fieldIdx = {} as Record<AppField, number>;
    for (const [field, header] of Object.entries(FIELD_TO_HEADER)) {
        fieldIdx[field as AppField] = headers.findIndex(
            (candidate) => candidate.toLowerCase() === header.toLowerCase(),
        );
    }

    const rows: AppRow[] = [];
    const seen = new Set<string>();

    // +2 skips the header and the |---|---| separator beneath it.
    for (let i = headerIdx + 2; i < lines.length; i++) {
        const line = lines[i];
        if (!line.startsWith("|")) continue;

        const cells = splitRow(line);
        const cell = (field: AppField): string => {
            const idx = fieldIdx[field];
            return idx !== -1 && idx < cells.length ? cells[idx] : "";
        };

        const name = cell("name");
        if (!name) continue;

        // APPS.md is newest-first, so the first occurrence wins.
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        rows.push({
            emoji: cell("emoji"),
            name,
            webUrl: cell("webUrl"),
            description: cell("description"),
            language: cell("language"),
            category: cell("category"),
            platform: cell("platform"),
            githubUsername: cell("githubUsername"),
            githubUserId: cell("githubUserId"),
            repoUrl: cell("repoUrl"),
            discord: cell("discord"),
            other: cell("other"),
            submittedDate: cell("submittedDate"),
            issueUrl: cell("issueUrl"),
            approvedDate: cell("approvedDate"),
            stars: parseStars(cell("stars")),
            byop: parseFlag(cell("byop")),
            requests24h: Number.parseInt(cell("requests24h"), 10) || 0,
        });
    }

    return rows;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The three badges, computed exactly as
 * .github/scripts/app-update-greenhouse.js computes them. All three measure
 * traffic or recency — none of them is editorial.
 */
export function isBuzz(app: AppRow): boolean {
    return app.requests24h >= 100;
}
export function isPollen(app: AppRow): boolean {
    return app.byop;
}
export function isFresh(app: AppRow, now: number = Date.now()): boolean {
    if (!app.approvedDate) return false;
    const approved = new Date(app.approvedDate).getTime();
    return Number.isFinite(approved) && approved >= now - THIRTY_DAYS_MS;
}
