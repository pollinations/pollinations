const { spawnSync } = require("node:child_process");
const path = require("node:path");

const RECEIPT_MARKER = "<!-- QUEST_PAYOUT_DATA:v1 -->";

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

async function getProjectFields(github, projectId) {
    const result = await github.graphql(
        `query($id: ID!) { node(id: $id) { ... on ProjectV2 {
            fields(first: 50) { nodes {
                ... on ProjectV2SingleSelectField { id name options { id name } }
            }}
        }}}`,
        { id: projectId },
    );
    return result.node.fields.nodes.filter((f) => f && f.id);
}

async function setIssueStatus({ github, core }, projectId, issue, target) {
    const fields = await getProjectFields(github, projectId);
    const field = fields.find((f) => f.name === "Status");
    const option = field?.options.find((o) => o.name === target);
    if (!option) {
        core.warning(
            `Status option "${target}" missing — run issue-quest-gate.yml setup once.`,
        );
        return;
    }

    const add = await github.graphql(
        `mutation($p:ID!,$c:ID!){addProjectV2ItemById(input:{projectId:$p,contentId:$c}){item{id}}}`,
        { p: projectId, c: issue.node_id },
    );
    await github.graphql(
        `mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{singleSelectOptionId:$o}}){projectV2Item{id}}}`,
        {
            p: projectId,
            i: add.addProjectV2ItemById.item.id,
            f: field.id,
            o: option.id,
        },
    );
    core.info(`#${issue.number} → ${target}`);
}

async function resolveLinkedQuest({ github, context, core }) {
    const pr = context.payload.pull_request;
    const closePattern = /(?:closes?|fixes?|resolves?)\s+#(\d+)/gi;
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
            node_id: issue.node_id,
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

async function setQuestStatus(args) {
    const quest = parseJsonEnv("QUEST");
    if (!quest) return;

    const target =
        args.context.payload.action === "closed" &&
        args.context.payload.pull_request.merged
            ? "Reward Ready"
            : "In Review";
    await setIssueStatus(args, process.env.PROJECT_ID, quest, target);
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

async function findReceiptComment({ github, context }, issueNumber) {
    const comments = await github.paginate(github.rest.issues.listComments, {
        ...repo(context),
        issue_number: issueNumber,
        per_page: 100,
    });
    return comments
        .reverse()
        .find(
            (comment) =>
                comment.user?.type === "Bot" &&
                comment.body?.includes(RECEIPT_MARKER),
        );
}

function buildReceiptBody(context, quest, result) {
    const paid = result.status === "granted" || result.status === "duplicate";
    const receipt = {
        status: paid ? "paid_out" : "manual_review",
        quest_issue: quest.number,
        pr: context.payload.pull_request.number,
        recipient: result.user,
        amount: result.amount,
        result: result.status,
        processed_at: new Date().toISOString(),
    };

    const lines = [
        RECEIPT_MARKER,
        "```json",
        JSON.stringify(receipt, null, 2),
        "```",
        "",
        paid
            ? "### 🌸 Quest reward paid out"
            : "### ⚠️ Quest reward needs review",
        "",
    ];

    if (result.status === "granted") {
        lines.push(`- **${result.amount}** Pollen → @${result.user}`);
    } else if (result.status === "duplicate") {
        lines.push(
            `- **${result.amount}** Pollen → @${result.user} already credited`,
        );
    } else if (result.status === "not_found") {
        lines.push(
            `@${process.env.PAYOUT_FALLBACK} — @${result.user} is not registered at enter.pollinations.ai; please back-fill ${result.amount} Pollen manually.`,
        );
    } else {
        lines.push(
            `@${process.env.PAYOUT_FALLBACK} — D1 grant failed for @${result.user}: ${result.amount} Pollen`,
        );
    }

    return { body: lines.join("\n"), paid };
}

async function upsertReceiptComment(args, issueNumber, body) {
    const existing = await findReceiptComment(args, issueNumber);
    if (existing) {
        await args.github.rest.issues.updateComment({
            ...repo(args.context),
            comment_id: existing.id,
            body,
        });
        return;
    }

    await args.github.rest.issues.createComment({
        ...repo(args.context),
        issue_number: issueNumber,
        body,
    });
}

async function markPaidOutAndComment(args) {
    const quest = parseJsonEnv("QUEST");
    const result = parseJsonEnv("RESULT");
    if (!quest || !result) return;

    const { body, paid } = buildReceiptBody(args.context, quest, result);
    await upsertReceiptComment(args, quest.number, body);

    if (paid) {
        await setIssueStatus(args, process.env.PROJECT_ID, quest, "Paid Out");
    }
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

    const statusByCode = {
        0: "granted",
        2: "not_found",
        3: "duplicate",
    };

    return {
        issue: payout.issue,
        user: payout.recipient,
        amount: payout.amount,
        status: statusByCode[result.status] || "error",
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
    markPaidOutAndComment,
    resolveLinkedQuest,
    runPollenGrant,
    setQuestStatus,
};
