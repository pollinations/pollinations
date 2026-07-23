#!/usr/bin/env node

const { execFileSync } = require("node:child_process");
const {
    buildRow,
    findCatalogDuplicate,
    parseSubmission,
    validateSubmission,
} = require("./lib/app-submission.js");

const ISSUE_NUMBER = process.env.ISSUE_NUMBER;
const ISSUE_AUTHOR = process.env.ISSUE_AUTHOR;

function gh(args) {
    return execFileSync("gh", args, { encoding: "utf8" }).trim();
}

function main() {
    if (!/^\d+$/.test(ISSUE_NUMBER || ""))
        throw new Error("ISSUE_NUMBER must be numeric");
    if (!/^[A-Za-z0-9-]+$/.test(ISSUE_AUTHOR || ""))
        throw new Error("ISSUE_AUTHOR is invalid");

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
    const errors = validateSubmission(submission);
    const duplicate = findCatalogDuplicate(submission, undefined, ISSUE_AUTHOR);
    if (duplicate) {
        errors.push(
            `This app appears to already be listed as ${duplicate.name} in apps/APPS.md.`,
        );
    }
    const pendingIssues = JSON.parse(
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
    );
    const pendingDuplicate = pendingIssues.find((candidate) => {
        if (String(candidate.number) === ISSUE_NUMBER) return false;
        const parsed = parseSubmission(candidate.body);
        return findCatalogDuplicate(
            submission,
            [
                {
                    name: parsed.name,
                    webUrl: parsed.appUrl,
                    repoUrl: parsed.repoUrl,
                    githubUsername: candidate.author?.login || "",
                },
            ],
            ISSUE_AUTHOR,
        );
    });
    if (pendingDuplicate) {
        errors.push(
            `This app appears to duplicate open submission #${pendingDuplicate.number}: ${pendingDuplicate.url}`,
        );
    }

    const githubUser = JSON.parse(gh(["api", `/users/${ISSUE_AUTHOR}`]));
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
        row: errors.length === 0 ? buildRow(submission, metadata) : "",
    };
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (!result.valid) process.exitCode = 2;
}

try {
    main();
} catch (error) {
    process.stdout.write(
        `${JSON.stringify({ valid: false, system_error: error.message })}\n`,
    );
    process.exitCode = 1;
}
