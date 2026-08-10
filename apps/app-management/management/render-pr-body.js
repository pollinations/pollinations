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
    const kept = results.filter((result) => result.outcome === "keep").length;
    const unresolved = results.filter((result) => result.outcome === "retry");

    const updates = updatedApps.flatMap((app) =>
        app.changes.map(
            (change) =>
                `| ${tableCell(app.name)} | ${tableCell(change.field)} | ${tableCell(change.from)} | ${tableCell(change.to)} | ${tableCell(change.reason)} |`,
        ),
    );
    const removals = removedApps.map(
        (app) =>
            `| ${tableCell(app.name)} | ${tableCell(app.url)} | ${tableCell(app.proposalReason || app.reason)} | ${tableCell(app.confirmationReason || app.reason)} |`,
    );
    const unresolvedRows = unresolved.map((result) =>
        [
            tableCell(result.name),
            tableCell(result.retryKind || "unspecified"),
            tableCell(
                [
                    result.uploadError ||
                        result.error ||
                        result.review?.reason ||
                        "No usable screenshot",
                    result.review?.proposal?.reason
                        ? `Proposed removal: ${result.review.proposal.reason}`
                        : null,
                    result.review?.confirmation?.reason
                        ? `Independent review: ${result.review.confirmation.reason}`
                        : null,
                ]
                    .filter(Boolean)
                    .join(" — "),
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
                `<details><summary>${html(result.name)}</summary>\n\n![Retry evidence](${result.evidenceUrl})\n\n</details>`,
        );
    const marker =
        removedApps.length > 0
            ? `<!-- pollinations-app-management:${Buffer.from(
                  JSON.stringify({ action: "remove", apps: removedApps }),
              ).toString("base64")} -->`
            : "";

    return `## Summary

- Reviewed ${results.length} targets: ${kept} kept, ${removedApps.length} removed, ${unresolved.length} queued for retry.
- Updated ${updatedApps.length} catalog rows with accepted screenshots or metadata corrections.
- [Structured report and anonymous screenshot evidence](${runUrl}) are retained for 30 days.

## Catalog updates

| App | Field | Before | After | Reason |
| --- | --- | --- | --- | --- |
${updates.join("\n") || "| — | — | — | — | None |"}

## Removed

| App | URL | Agent finding | Independent confirmation |
| --- | --- | --- | --- |
${removals.join("\n") || "| — | — | — | None |"}

## Retry queue — no catalog change

| App | Type | Reason | Evidence |
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
