#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const { readApps } = require("../app.js");
const {
    buildApp,
    checkScreenshot,
    parseSubmission,
    submissionErrors,
} = require("./submission.js");

const ISSUE_NUMBER = process.env.ISSUE_NUMBER;
const ISSUE_AUTHOR = process.env.ISSUE_AUTHOR;

function gh(args) {
    return execFileSync("gh", args, { encoding: "utf8" }).trim();
}

function isOpenQuest(number) {
    let issue;
    try {
        issue = JSON.parse(
            gh([
                "issue",
                "view",
                number,
                "--repo",
                "pollinations/pollinations",
                "--json",
                "state,labels",
            ]),
        );
    } catch {
        return false;
    }
    return (
        issue.state === "OPEN" &&
        issue.labels.some((label) => label.name === "POLLEN-QUEST")
    );
}

async function main() {
    if (!/^\d+$/.test(ISSUE_NUMBER || ""))
        throw new Error("ISSUE_NUMBER must be numeric");
    if (!/^[A-Za-z0-9-]+$/.test(ISSUE_AUTHOR || ""))
        throw new Error("ISSUE_AUTHOR is invalid");

    const githubUser = JSON.parse(gh(["api", `/users/${ISSUE_AUTHOR}`]));
    if (!Number.isInteger(githubUser.id))
        throw new Error("Issue author has no numeric GitHub user ID");

    const issue = Object.hasOwn(process.env, "ISSUE_BODY")
        ? {
              body: process.env.ISSUE_BODY,
              createdAt: process.env.ISSUE_CREATED_AT,
              url: process.env.ISSUE_URL,
          }
        : JSON.parse(
              gh([
                  "issue",
                  "view",
                  ISSUE_NUMBER,
                  "--repo",
                  "pollinations/pollinations",
                  "--json",
                  "body,createdAt,url",
              ]),
          );
    if (!issue.createdAt || !issue.url)
        throw new Error("Issue snapshot metadata is incomplete");
    const submission = parseSubmission(issue.body);
    const openSubmissions = JSON.parse(
        gh([
            "issue",
            "list",
            "--repo",
            "pollinations/pollinations",
            "--state",
            "open",
            "--label",
            "APP-SUBMISSION",
            "--limit",
            "500",
            "--json",
            "number,body,url,author",
        ]),
    ).map((candidate) => ({
        number: candidate.number,
        body: candidate.body,
        url: candidate.url,
        authorNodeId: candidate.author?.id,
    }));
    const errors = submissionErrors({
        submission,
        issueNumber: ISSUE_NUMBER,
        author: { id: githubUser.id, nodeId: githubUser.node_id },
        apps: readApps(),
        openSubmissions,
        questOpen: /^\d+$/.test(submission.quest)
            ? isOpenQuest(submission.quest)
            : false,
        screenshot: submission.screenshotUrl
            ? await checkScreenshot(submission.screenshotUrl)
            : [],
    });

    const approvedDate =
        process.env.APPROVED_DATE || new Date().toISOString().slice(0, 10);
    const metadata = {
        githubUsername: ISSUE_AUTHOR,
        githubUserId: githubUser.id,
        submittedDate: issue.createdAt.slice(0, 10),
        issueUrl: issue.url,
        approvedDate,
    };

    const result = {
        valid: errors.length === 0,
        errors,
        submission,
        metadata,
        app: errors.length === 0 ? buildApp(submission, metadata) : null,
    };
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (!result.valid) process.exitCode = 2;
}

main().catch((error) => {
    process.stdout.write(
        `${JSON.stringify({ valid: false, system_error: error.message })}\n`,
    );
    process.exitCode = 1;
});
