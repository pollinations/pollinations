#!/usr/bin/env node
// Regenerates the README star-history chart snapshots (.github/assets/star-history-{light,dark}.svg).
// The live star-history.com embed is blocked by GitHub's stargazer API restriction,
// so the README ships a committed snapshot generated from the repo's own star data.
//
// Usage: GITHUB_TOKEN=$(gh auth token) node .github/scripts/star-history-chart.mjs
// Requires a token that can read stargazers (repo collaborator).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "pollinations/pollinations";
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");

const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
if (!token) {
    console.error("Set GITHUB_TOKEN (e.g. GITHUB_TOKEN=$(gh auth token))");
    process.exit(1);
}

async function fetchStarDates() {
    const dates = [];
    for (let page = 1; ; page++) {
        const res = await fetch(
            `https://api.github.com/repos/${REPO}/stargazers?per_page=100&page=${page}`,
            {
                headers: {
                    Accept: "application/vnd.github.star+json",
                    Authorization: `Bearer ${token}`,
                },
            },
        );
        if (!res.ok)
            throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
        const batch = await res.json();
        if (batch.length === 0) break;
        for (const s of batch) dates.push(new Date(s.starred_at));
    }
    return dates.sort((a, b) => a - b);
}

const THEMES = {
    light: {
        stroke: "#b45309",
        area: "rgba(180,83,9,0.08)",
        grid: "#e8e6e3",
        axis: "#6e6a66",
        title: "#292524",
        muted: "#a8a29e",
    },
    dark: {
        stroke: "#b58d26",
        area: "rgba(181,141,38,0.14)",
        grid: "#30363d",
        axis: "#8b949e",
        title: "#e6edf3",
        muted: "#6e7681",
    },
};

const W = 600;
const H = 340;
const M = { top: 44, right: 24, bottom: 30, left: 44 };
const FONT = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

function buildSvg(dates, theme) {
    const t = THEMES[theme];
    const total = dates.length;
    const t0 = dates[0].getTime();
    const t1 = Date.now();
    const yMax = Math.ceil(total / 1000) * 1000;
    const plotW = W - M.left - M.right;
    const plotH = H - M.top - M.bottom;
    const x = (ms) => M.left + ((ms - t0) / (t1 - t0)) * plotW;
    const y = (n) => M.top + plotH - (n / yMax) * plotH;

    // Sample the cumulative curve weekly to keep the path small.
    const week = 7 * 24 * 3600 * 1000;
    const pts = [[x(t0), y(0)]];
    let i = 0;
    for (let ms = t0 + week; ms < t1; ms += week) {
        while (i < total && dates[i].getTime() <= ms) i++;
        pts.push([x(ms), y(i)]);
    }
    pts.push([x(t1), y(total)]);
    const path = pts
        .map(
            ([px, py], k) =>
                `${k === 0 ? "M" : "L"}${px.toFixed(1)} ${py.toFixed(1)}`,
        )
        .join(" ");

    const gridLines = [];
    const yLabels = [];
    for (let n = 1000; n <= yMax; n += 1000) {
        gridLines.push(
            `<line x1="${M.left}" y1="${y(n).toFixed(1)}" x2="${W - M.right}" y2="${y(n).toFixed(1)}" stroke="${t.grid}" stroke-width="1"/>`,
        );
        yLabels.push(
            `<text x="${M.left - 8}" y="${(y(n) + 3.5).toFixed(1)}" text-anchor="end" fill="${t.axis}" font-size="10">${n / 1000}k</text>`,
        );
    }

    const xLabels = [];
    for (
        let yr = dates[0].getUTCFullYear() + 1;
        yr <= new Date(t1).getUTCFullYear();
        yr++
    ) {
        const ms = Date.UTC(yr, 0, 1);
        xLabels.push(
            `<line x1="${x(ms).toFixed(1)}" y1="${M.top + plotH}" x2="${x(ms).toFixed(1)}" y2="${M.top + plotH + 4}" stroke="${t.axis}" stroke-width="1"/>`,
            `<text x="${x(ms).toFixed(1)}" y="${M.top + plotH + 16}" text-anchor="middle" fill="${t.axis}" font-size="10">${yr}</text>`,
        );
    }

    const [ex, ey] = pts[pts.length - 1];
    const snapshot = new Date(t1).toISOString().slice(0, 10);

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Star history of ${REPO}: ${total} stars">
  <g font-family="${FONT}">
    <text x="${M.left}" y="20" fill="${t.title}" font-size="13" font-weight="600">${REPO} · GitHub star history</text>
    <text x="${W - M.right}" y="20" text-anchor="end" fill="${t.muted}" font-size="10">snapshot ${snapshot}</text>
    ${gridLines.join("\n    ")}
    <line x1="${M.left}" y1="${M.top + plotH}" x2="${W - M.right}" y2="${M.top + plotH}" stroke="${t.grid}" stroke-width="1"/>
    ${yLabels.join("\n    ")}
    ${xLabels.join("\n    ")}
    <path d="${path} L${ex.toFixed(1)} ${y(0)} L${pts[0][0].toFixed(1)} ${y(0)} Z" fill="${t.area}" stroke="none"/>
    <path d="${path}" fill="none" stroke="${t.stroke}" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="4" fill="${t.stroke}"/>
    <text x="${(ex - 8).toFixed(1)}" y="${(ey - 10).toFixed(1)}" text-anchor="end" fill="${t.title}" font-size="11" font-weight="600">${total.toLocaleString("en-US")} ★</text>
  </g>
</svg>
`;
}

const dates = await fetchStarDates();
mkdirSync(OUT_DIR, { recursive: true });
for (const theme of Object.keys(THEMES)) {
    const file = join(OUT_DIR, `star-history-${theme}.svg`);
    writeFileSync(file, buildSvg(dates, theme));
    console.log(`wrote ${file} (${dates.length} stars)`);
}
