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
    // Use GitHub's native PR↔issue link: covers "Fixes #N" keywords AND the
    // Development sidebar manual link. Means maintainers can rescue a quest
    // PR pre-merge without contributor cooperation.
    const data = await github.graphql(
        `query($owner:String!,$repo:String!,$num:Int!) {
            repository(owner:$owner,name:$repo) {
                pullRequest(number:$num) {
                    closingIssuesReferences(first:10) {
                        nodes {
                            number body
                            labels(first:20) { nodes { name } }
                            assignees(first:5) { nodes { login databaseId } }
                        }
                    }
                }
            }
        }`,
        { ...repo(context), num: pr.number },
    );

    const issue =
        data.repository.pullRequest.closingIssuesReferences.nodes.find((n) =>
            n.labels.nodes.some((l) => l.name === "POLLEN-QUEST"),
        );

    if (!issue) {
        core.setOutput("quest", "");
        core.info("Linked POLLEN-QUEST issue: (none)");
        return;
    }

    const assignee = issue.assignees.nodes[0];
    core.setOutput(
        "quest",
        JSON.stringify({
            number: issue.number,
            assignee: assignee
                ? { login: assignee.login, id: assignee.databaseId }
                : null,
            body: issue.body || "",
        }),
    );
    core.info(`Linked POLLEN-QUEST issue: #${issue.number}`);
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
            result.status === 0 || result.status === 3
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
