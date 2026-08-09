#!/usr/bin/env node

const fs = require("node:fs");

function tableCell(value) {
    if (value == null || value === "") return "—";
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("|", "&#124;")
        .replace(/[\r\n]+/g, " ");
}

function html(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

function renderPrBody(report, runUrl) {
    const results = report.results || [];
    const updatedApps = report.updatedApps || [];
    const removedApps = report.removedApps || [];
    const unresolved = results.filter(
        (result) => !["approved", "confirmed_removal"].includes(result.outcome),
    );

    const updates = updatedApps.flatMap((app) =>
        app.changes.map(
            (change) =>
                `| ${tableCell(app.name)} | ${tableCell(change.field)} | ${tableCell(change.from)} | ${tableCell(change.to)} | ${tableCell(change.reason)} |`,
        ),
    );
    const removals = removedApps.map(
        (app) =>
            `| ${tableCell(app.name)} | ${tableCell(app.url)} | ${tableCell(app.reason)} |`,
    );
    const unresolvedRows = unresolved.map((result) =>
        [
            tableCell(result.name),
            tableCell(result.outcome),
            tableCell(
                result.uploadError ||
                    result.error ||
                    result.review?.reason ||
                    "No usable screenshot",
            ),
            tableCell(result.evidenceUrl || result.evidenceFile),
        ].join(" | "),
    );
    const evidence = unresolved
        .filter((result) =>
            /^https:\/\/media\.pollinations\.ai\/\S+$/.test(
                result.evidenceUrl || "",
            ),
        )
        .map(
            (result) =>
                `<details><summary>${html(result.name)}</summary>\n\n![Rejected terminal screen](${result.evidenceUrl})\n\n</details>`,
        );
    const marker =
        removedApps.length > 0
            ? `<!-- pollinations-app-management:${Buffer.from(
                  JSON.stringify({ action: "remove", apps: removedApps }),
              ).toString("base64")} -->`
            : "";

    return `## Summary

- Reviewed ${results.length} targets: ${updatedApps.length} catalog rows updated, ${removedApps.length} removed, ${unresolved.length} unresolved.
- [Structured report and anonymous screenshot evidence](${runUrl}) are retained for 30 days.

## Catalog updates

| App | Field | Before | After | Reason |
| --- | --- | --- | --- | --- |
${updates.join("\n") || "| — | — | — | — | None |"}

## Removed

| App | URL | Confirmed reason |
| --- | --- | --- |
${removals.join("\n") || "| — | — | None |"}

## Unresolved — no catalog change

| App | Outcome | Reason | Evidence |
| --- | --- | --- | --- |
${unresolvedRows.map((row) => `| ${row} |`).join("\n") || "| — | — | None | — |"}

### Screenshot evidence

${evidence.join("\n\n") || "No anonymous screenshot evidence was safe to publish."}

${marker}
`;
}

if (require.main === module) {
    const [reportPath, runUrl] = process.argv.slice(2);
    if (!reportPath || !runUrl) {
        throw new Error("Usage: render-pr-body.js REPORT_PATH RUN_URL");
    }
    process.stdout.write(
        renderPrBody(JSON.parse(fs.readFileSync(reportPath, "utf8")), runUrl),
    );
}

module.exports = { renderPrBody };
