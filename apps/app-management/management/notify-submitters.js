#!/usr/bin/env node

const fs = require("node:fs");

const MARKER_PATTERN = /<!-- pollinations-app-management:([A-Za-z0-9+/=]+) -->/;

function parseNotification(body) {
    const match = body?.match(MARKER_PATTERN);
    if (!match) return null;
    const payload = JSON.parse(Buffer.from(match[1], "base64").toString());
    if (payload.action !== "remove") {
        throw new Error("Unknown app-management notification action");
    }
    if (!Array.isArray(payload.apps)) {
        throw new Error("App-management notification has no apps");
    }
    return payload;
}

function issueNumber(issueUrl, repository) {
    const prefix = `https://github.com/${repository}/issues/`;
    if (!issueUrl?.startsWith(prefix)) return null;
    const value = issueUrl.slice(prefix.length);
    return /^\d+$/.test(value) ? value : null;
}

function commentFor(app, pullRequestUrl) {
    return `${app.name} was removed from the community app catalog because the automated review confirmed: ${app.reason}.\n\nWhen it is working again, reply here with a short confirmation or a replacement live-app URL for maintainer review.\n\nCatalog change: ${pullRequestUrl}`;
}

async function notify(event, token, fetchImpl = fetch) {
    if (!event.pull_request?.merged) return 0;
    const payload = parseNotification(event.pull_request.body);
    if (!payload) return 0;
    const repository = event.repository.full_name;
    let sent = 0;
    for (const app of payload.apps) {
        const number = issueNumber(app.issueUrl, repository);
        if (!number) continue;
        const response = await fetchImpl(
            `https://api.github.com/repos/${repository}/issues/${number}/comments`,
            {
                method: "POST",
                headers: {
                    Accept: "application/vnd.github+json",
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
                body: JSON.stringify({
                    body: commentFor(app, event.pull_request.html_url),
                }),
            },
        );
        if (!response.ok) {
            throw new Error(
                `GitHub comment failed for issue ${number}: HTTP ${response.status}`,
            );
        }
        sent++;
    }
    return sent;
}

async function main() {
    const token = process.env.GH_TOKEN;
    if (!token) throw new Error("GH_TOKEN missing");
    const event = JSON.parse(
        fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"),
    );
    console.log(`Notified ${await notify(event, token)} app submitters`);
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    });
}

module.exports = { commentFor, issueNumber, notify, parseNotification };
