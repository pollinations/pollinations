#!/usr/bin/env node

/**
 * Generate apps/GREENHOUSE.md — a curated highlight reel from all categories.
 *
 * Reads apps/APPS.md (source of truth) and writes:
 *   apps/GREENHOUSE.md  – top apps per category + label highlights
 *   README.md            – updates "Recent Apps" section in repo root
 *
 * Usage: node .github/scripts/app-update-greenhouse.js
 */

const fs = require("fs");

// ── Config ──────────────────────────────────────────────────────────────────

const APPS_FILE = "apps/APPS.md";
const GARDEN_FILE = "apps/GREENHOUSE.md";
const ROOT_README = "README.md";

const THIRTY_DAYS_MS = 30 * 86400000;
const TOP_N = 10;

const CATEGORIES = [
    { id: "image", label: "Image", emoji: "🖼️" },
    { id: "video_audio", label: "Video & Audio", emoji: "🎬" },
    { id: "writing", label: "Write", emoji: "✍️" },
    { id: "chat", label: "Chat", emoji: "💬" },
    { id: "games", label: "Play", emoji: "🎮" },
    { id: "learn", label: "Learn", emoji: "📚" },
    { id: "bots", label: "Bots", emoji: "🤖" },
    { id: "build", label: "Build", emoji: "🛠️" },
    { id: "business", label: "Business", emoji: "💼" },
];

// ── Parse ───────────────────────────────────────────────────────────────────

// Known platform values from AGENTS.md — used to detect per-row schema
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

function parseCols(line) {
    const cols = line.split("|").map((c) => c.trim());
    cols.shift();
    cols.pop();
    return cols;
}

// Detect whether a row has the Platform column at index 6.
// Rows with Platform have it at cols[6] (a known platform value)
// and GitHub_Username at cols[7] (starts with @).
// Some rows under old headers were inserted with Platform despite
// the header not listing it, so we detect per-row.
function hasPlatformCol(cols) {
    const val6 = (cols[6] || "").toLowerCase();
    // Check for comma-separated platforms too (e.g. "telegram,whatsapp")
    const platforms = val6.split(",").map((s) => s.trim());
    return platforms.every((p) => PLATFORMS.has(p)) && val6 !== "";
}

function parseApps() {
    const content = fs.readFileSync(APPS_FILE, "utf8");
    const lines = content.split("\n");
    const headerIdx = lines.findIndex((l) => l.startsWith("| Emoji"));
    if (headerIdx === -1) {
        console.error("Error: Could not find header row in APPS.md");
        process.exit(1);
    }

    const rows = lines.slice(headerIdx + 1).filter((l) => l.startsWith("|"));
    return rows
        .map((row) => {
            // Skip header and separator rows
            if (row.startsWith("| Emoji") || row.startsWith("| ---"))
                return null;

            const cols = parseCols(row);
            if (cols.length < 10) return null;

            // Determine column offset: if Platform column is present, shift by 1
            const off = hasPlatformCol(cols) ? 1 : 0;
            const gi = 6 + off;
            const ri = 8 + off;
            const si = 9 + off;
            const ai = 14 + off;
            const bi = 15 + off;
            const rqi = 16 + off;

            const starsCol = cols[si] || "";
            let stars = 0;
            const m = starsCol.match(/⭐([\d.]+)(k)?/);
            if (m) {
                stars = parseFloat(m[1]);
                if (m[2] === "k") stars *= 1000;
                stars = Math.round(stars);
            }

            return {
                emoji: cols[0],
                name: cols[1],
                url: cols[2],
                description: cols[3],
                category: (cols[5] || "").toLowerCase(),
                github: cols[gi],
                repo: cols[ri],
                stars,
                approvedDate: cols[ai] || "",
                byop: cols.length > bi && cols[bi] === "true",
                requests24h:
                    cols.length > rqi ? parseInt(cols[rqi], 10) || 0 : 0,
            };
        })
        .filter(Boolean);
}

// ── Classify ────────────────────────────────────────────────────────────────

function isFresh(app) {
    return (
        !!app.approvedDate &&
        new Date(app.approvedDate) >= new Date(Date.now() - THIRTY_DAYS_MS)
    );
}
function isPollen(app) {
    return app.byop;
}
function isBuzz(app) {
    return app.requests24h >= 100;
}

// ── Sort: buzz → pollen → stars → newest ────────────────────────────────────

function sortApps(a, b) {
    const t = +isBuzz(b) - +isBuzz(a);
    if (t) return t;
    if (a.byop !== b.byop) return a.byop ? -1 : 1;
    const s = (b.stars || 0) - (a.stars || 0);
    if (s) return s;
    return (b.approvedDate || "").localeCompare(a.approvedDate || "");
}

// ── Formatting helpers ──────────────────────────────────────────────────────

function appLink(app) {
    const href = app.url || app.repo;
    const label = `${app.emoji} ${app.name}`.trim();
    return href ? `[${label}](${href})` : label;
}

function badgeStr(app) {
    const b = [];
    if (isBuzz(app)) b.push("🐝");
    if (isPollen(app)) b.push("🏵️");
    if (isFresh(app)) b.push("🫧");
    return b.join(" ");
}

function authorStr(app) {
    const gh = app.github?.replace(/^@/, "");
    return gh ? `[@${gh}](https://github.com/${gh})` : "";
}

function starsStr(app) {
    if (!app.stars) return "";
    if (app.stars >= 1000)
        return `${(app.stars / 1000).toFixed(1).replace(/\.0$/, "")}k`;
    return String(app.stars);
}

function makeTable(apps) {
    const header =
        "| App | Description | Author | ⭐ | |\n|-----|-------------|--------|---:|---|";
    const rows = apps.map(
        (a) =>
            `| ${appLink(a)} | ${a.description || ""} | ${authorStr(a)} | ${starsStr(a)} | ${badgeStr(a)} |`,
    );
    return header + "\n" + rows.join("\n");
}

// ── Generate GREENHOUSE.md ──────────────────────────────────────────────────

function generateGarden(apps) {
    const buzzApps = apps
        .filter(isBuzz)
        .sort((a, b) => b.requests24h - a.requests24h);
    const pollenApps = apps
        .filter(isPollen)
        .sort((a, b) => (b.stars || 0) - (a.stars || 0));
    const freshApps = apps
        .filter(isFresh)
        .sort((a, b) =>
            (b.approvedDate || "").localeCompare(a.approvedDate || ""),
        );

    let md = `# 🔆 App Greenhouse

> **${apps.length}** community apps powered by [pollinations.ai](https://pollinations.ai)

🐝 **Buzz** = 100+ requests/24h · 🏵️ **Pollen** = Sign in with Pollinations · 🫧 **Fresh** = Added in the last 30 days

📋 [Full app table](APPS.md) · 🌐 [Browse on pollinations.ai](https://pollinations.ai/apps) · ✏️ [Submit your app](https://github.com/pollinations/pollinations/issues/new?template=tier-app-submission.yml)

---

`;

    // Label highlights
    if (buzzApps.length > 0) {
        md += `## 🐝 Buzz — Trending Now\n\n`;
        md += makeTable(buzzApps.slice(0, TOP_N)) + "\n\n";
    }

    if (pollenApps.length > 0) {
        md += `## 🏵️ Pollen — Sign in with Pollinations\n\n`;
        md += `Users pay with their own balance — developers pay $0. [Learn more →](../BRING_YOUR_OWN_POLLEN.md)\n\n`;
        md += makeTable(pollenApps.slice(0, TOP_N)) + "\n\n";
    }

    if (freshApps.length > 0) {
        md += `## 🫧 Fresh — Recently Added\n\n`;
        md += makeTable(freshApps.slice(0, TOP_N)) + "\n\n";
    }

    // Category sections
    for (const cat of CATEGORIES) {
        const catApps = apps
            .filter((a) => a.category === cat.id)
            .sort(sortApps);
        if (catApps.length === 0) continue;

        md += `---\n\n## ${cat.emoji} ${cat.label}\n\n`;
        md += makeTable(catApps.slice(0, TOP_N)) + "\n";
        if (catApps.length > TOP_N) {
            md += `\n<details><summary>Show all ${catApps.length} apps</summary>\n\n`;
            md += makeTable(catApps.slice(TOP_N)) + "\n";
            md += `\n</details>\n`;
        }
        md += "\n";
    }

    return md;
}

// ── Update root README ──────────────────────────────────────────────────────

function updateRootReadme(apps) {
    const last10 = apps.slice(0, 10);
    const rows = last10.map(
        (a) => `| ${appLink(a)} | ${a.description || ""} | ${authorStr(a)} |`,
    );

    const section = `## 🆕 Recent Apps

| Name | Description | Author |
|------|-------------|--------|
${rows.join("\n")}

[Browse all apps →](apps/GREENHOUSE.md)`;

    if (!fs.existsSync(ROOT_README)) return;

    let readme = fs.readFileSync(ROOT_README, "utf8");
    const marker = "## 🆕 Recent Apps";
    const startIdx = readme.indexOf(marker);

    if (startIdx !== -1) {
        const afterMarker = readme.substring(startIdx + marker.length);
        const nextSection = afterMarker.search(/\n## /);
        const endIdx =
            nextSection !== -1
                ? startIdx + marker.length + nextSection
                : readme.length;
        readme =
            readme.substring(0, startIdx) + section + readme.substring(endIdx);
    } else {
        const firstHeading = readme.search(/\n## /);
        if (firstHeading !== -1) {
            readme =
                readme.substring(0, firstHeading) +
                "\n\n" +
                section +
                readme.substring(firstHeading);
        }
    }

    fs.writeFileSync(ROOT_README, readme);
    console.log("  ✅ Updated README.md (recent apps)");
}

// ── Main ────────────────────────────────────────────────────────────────────

const apps = parseApps();
console.log(`Parsed ${apps.length} apps from ${APPS_FILE}`);

fs.writeFileSync(GARDEN_FILE, generateGarden(apps));
console.log(`  ✅ Generated ${GARDEN_FILE}`);

updateRootReadme(apps);

console.log("\n🔆 Greenhouse updated!");
