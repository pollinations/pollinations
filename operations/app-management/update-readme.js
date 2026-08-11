#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { readApps } = require("./app.js");

const README_FILE = path.resolve(__dirname, "../../README.md");
const START_MARKER = "<!-- recent-apps:start -->";
const END_MARKER = "<!-- recent-apps:end -->";
const INSERT_BEFORE = "## 🚀 Unified API";

function cell(value) {
    return String(value ?? "")
        .replace(/\s+/g, " ")
        .replace(/\|/g, "\\|")
        .trim();
}

function appLink(app) {
    const label = cell(`${app.emoji} ${app.name}`);
    const url = app.url || app.repositoryUrl;
    return url ? `[${label}](${url})` : label;
}

function renderRecentApps(apps) {
    const recent = apps
        .map((app, index) => ({ app, index }))
        .sort(
            (a, b) =>
                (b.app.approvedDate || "").localeCompare(
                    a.app.approvedDate || "",
                ) || a.index - b.index,
        )
        .slice(0, 10)
        .map(({ app }) => app);

    const rows = recent.map((app) => {
        const username = cell(app.githubUsername);
        const author = username
            ? `[@${username}](https://github.com/${username})`
            : "";
        return `| ${appLink(app)} | ${cell(app.description)} | ${author} |`;
    });

    return `${START_MARKER}
## 🆕 Recent Apps

| Name | Description | Author |
|------|-------------|--------|
${rows.join("\n")}

[Browse all apps →](https://pollinations.ai/apps)
${END_MARKER}`;
}

function updateReadme(readme, section) {
    const start = readme.indexOf(START_MARKER);
    const end = readme.indexOf(END_MARKER);
    if (start !== -1 && end !== -1) {
        return `${readme.slice(0, start)}${section}${readme.slice(end + END_MARKER.length)}`;
    }

    const insertion = readme.indexOf(INSERT_BEFORE);
    if (insertion === -1) {
        throw new Error(`README is missing ${INSERT_BEFORE}`);
    }
    return `${readme.slice(0, insertion)}${section}\n\n${readme.slice(insertion)}`;
}

const readme = fs.readFileSync(README_FILE, "utf8");
fs.writeFileSync(
    README_FILE,
    updateReadme(readme, renderRecentApps(readApps())),
);
console.log("Updated README.md recent apps");
