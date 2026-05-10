const { spawnSync } = require("node:child_process");
const path = require("node:path");

function repo(context) {
    return {
        owner: context.repo.owner,
        repo: context.repo.repo,
    };
}

function parseJsonEnv(name) {
    const value = process.env[name];
    return value ? JSON.parse(value) : null;
}

async function resolveLinkedQuest({ github, context, core }) {
    const pr = context.payload.pull_request;
    // GitHub closing keywords: close, closes, closed, fix, fixes, fixed, resolve, resolves, resolved.
    const closePattern = /(?:close[ds]?|fix(?:e[ds])?|resolve[ds]?)\s+#(\d+)/gi;
    const issueNumbers = [
        ...new Set(
            [...(pr.body || "").matchAll(closePattern)].map((m) =>
                Number(m[1]),
            ),
        ),
    ];

    for (const issueNumber of issueNumbers) {
        let issue;
        try {
            issue = (
                await github.rest.issues.get({
                    ...repo(context),
                    issue_number: issueNumber,
                })
            ).data;
        } catch {
            continue;
        }

        const labels = (issue.labels || []).map((label) =>
            typeof label === "string" ? label : label.name,
        );
        if (!labels.includes("POLLEN-QUEST")) continue;

        const quest = {
            number: issueNumber,
            assignee: issue.assignees?.[0]
                ? { login: issue.assignees[0].login, id: issue.assignees[0].id }
                : null,
            body: issue.body || "",
        };
        core.setOutput("quest", JSON.stringify(quest));
        core.info(`Linked POLLEN-QUEST issue: #${issueNumber}`);
        return;
    }

    core.setOutput("quest", "");
    core.info("Linked POLLEN-QUEST issue: (none)");
}

function parseReward(body) {
    const match = body.match(/###\s*Reward\s*\n+\s*([0-9]+(?:\.[0-9]+)?)/i);
    return match ? Number(match[1]) : null;
}

async function computePayout({ github, context, core }) {
    const quest = parseJsonEnv("QUEST");
    if (!quest) return;

    const reward = parseReward(quest.body);
    const missing = [];
    if (!quest.assignee) missing.push("assignee");
    if (reward === null || !Number.isFinite(reward) || reward <= 0) {
        missing.push("valid reward amount in issue body");
    }

    if (missing.length) {
        await github.rest.issues.createComment({
            ...repo(context),
            issue_number: quest.number,
            body: [
                `@${process.env.PAYOUT_FALLBACK} — quest payout could not be auto-processed.`,
                "",
                `**Missing:** ${missing.join(", ")}`,
                `- assignee: ${quest.assignee?.login ?? "(none)"}`,
                `- parsed reward: ${reward ?? "(unparsed)"}`,
                "",
                `Triggered by merge of #${context.payload.pull_request.number}. Please review and back-fill manually.`,
            ].join("\n"),
        });
        return;
    }

    core.setOutput(
        "payout",
        JSON.stringify({
            issue: quest.number,
            recipient: quest.assignee.login,
            recipientId: quest.assignee.id,
            amount: reward,
        }),
    );
}

function buildReceiptBody(result) {
    if (result.status === "granted") {
        return `### 🌸 Quest reward paid out\n\n- **${result.amount}** Pollen → @${result.user}`;
    }
    if (result.status === "not_found") {
        return `### ⚠️ Quest reward needs review\n\n@${process.env.PAYOUT_FALLBACK} — @${result.user} is not registered at enter.pollinations.ai; please back-fill ${result.amount} Pollen manually.`;
    }
    return `### ⚠️ Quest reward needs review\n\n@${process.env.PAYOUT_FALLBACK} — D1 grant failed for @${result.user}: ${result.amount} Pollen`;
}

async function postReceipt({ github, context }) {
    const quest = parseJsonEnv("QUEST");
    const result = parseJsonEnv("RESULT");
    if (!quest || !result) return;

    await github.rest.issues.createComment({
        ...repo(context),
        issue_number: quest.number,
        body: buildReceiptBody(result),
    });
}

function runGrant(enterDir, payout) {
    console.log(
        `→ granting ${payout.amount} Pollen to @${payout.recipient} for #${payout.issue}`,
    );
    const result = spawnSync(
        "npx",
        [
            "tsx",
            "src/tier-progression/shared/quest-grant-pollen.ts",
            "grant",
            "--githubId",
            String(payout.recipientId),
            "--githubUsername",
            payout.recipient,
            "--amount",
            String(payout.amount),
            "--questIssue",
            String(payout.issue),
            "--prNumber",
            String(process.env.PR_NUMBER),
            "--env",
            "production",
        ],
        {
            cwd: enterDir,
            encoding: "utf8",
        },
    );

    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);

    return {
        issue: payout.issue,
        user: payout.recipient,
        amount: payout.amount,
        status:
            result.status === 0
                ? "granted"
                : result.status === 2
                  ? "not_found"
                  : "failed",
    };
}

async function runPollenGrant({ core }) {
    const payout = parseJsonEnv("PAYOUT");
    if (!payout) return;

    const enterDir = path.join(process.cwd(), "enter.pollinations.ai");
    const install = spawnSync("npm", ["install"], {
        cwd: enterDir,
        encoding: "utf8",
        stdio: "inherit",
    });
    if (install.status !== 0) {
        throw new Error("npm install failed");
    }
    core.setOutput("result", JSON.stringify(runGrant(enterDir, payout)));
}

module.exports = {
    computePayout,
    postReceipt,
    resolveLinkedQuest,
    runPollenGrant,
};
