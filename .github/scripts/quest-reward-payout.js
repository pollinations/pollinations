const { spawnSync } = require("node:child_process");
const path = require("node:path");

const RECEIPT_MARKER = "<!-- QUEST_PAYOUT_DATA:v1 -->";

function repo(context) {
    return {
        owner: context.repo.owner,
        repo: context.repo.repo,
    };
}

function parseJsonEnv(name, fallback = null) {
    const value = process.env[name];
    return value ? JSON.parse(value) : fallback;
}

async function getStatusField(github, projectId) {
    const result = await github.graphql(
        `query($id: ID!) { node(id: $id) { ... on ProjectV2 {
            field(name: "Status") { ... on ProjectV2SingleSelectField { id options { id name } } }
        }}}`,
        { id: projectId },
    );
    return result.node.field;
}

async function setIssueStatus({ github, core }, projectId, issue, target) {
    const field = await getStatusField(github, projectId);
    const option = field.options.find((o) => o.name === target);
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

async function resolveLinkedQuests({ github, context, core }) {
    const pr = context.payload.pull_request;
    const closePattern = /(?:closes?|fixes?|resolves?)\s+#(\d+)/gi;
    const nums = [
        ...new Set(
            [...(pr.body || "").matchAll(closePattern)].map((m) =>
                Number(m[1]),
            ),
        ),
    ];

    const quests = [];
    for (const n of nums) {
        let issue;
        try {
            issue = (
                await github.rest.issues.get({
                    ...repo(context),
                    issue_number: n,
                })
            ).data;
        } catch {
            continue;
        }

        const labels = (issue.labels || []).map((l) =>
            typeof l === "string" ? l : l.name,
        );
        if (!labels.includes("POLLEN-QUEST")) continue;
        quests.push({
            number: n,
            node_id: issue.node_id,
            assignees: (issue.assignees || []).map((a) => a.login),
            body: issue.body || "",
        });
    }

    if (quests.length > 1) {
        const list = quests.map((q) => `#${q.number}`).join(", ");
        await github.rest.issues.createComment({
            ...repo(context),
            issue_number: pr.number,
            body: `Quest payout skipped: a PR must close exactly one POLLEN-QUEST issue, but this PR references ${list}.`,
        });
        core.setFailed(
            `Expected exactly one linked POLLEN-QUEST issue, found ${quests.length}: ${list}`,
        );
        return;
    }

    core.setOutput("quests", JSON.stringify(quests));
    core.info(
        `Linked POLLEN-QUEST issues: ${
            quests.map((q) => `#${q.number}`).join(", ") || "(none)"
        }`,
    );
}

async function setQuestStatus(args) {
    const quests = parseJsonEnv("QUESTS", []);
    const target =
        args.context.payload.action === "closed" &&
        args.context.payload.pull_request.merged
            ? "Reward Ready"
            : "In Review";

    for (const quest of quests) {
        await setIssueStatus(args, process.env.PROJECT_ID, quest, target);
    }
}

function parseReward(body) {
    const match = body.match(/###\s*Reward\s*\n+\s*([0-9]+(?:\.[0-9]+)?)/i);
    return match ? Number(match[1]) : null;
}

async function computePayouts({ github, context, core }) {
    const quests = parseJsonEnv("QUESTS", []);
    const payouts = [];
    const flags = [];

    for (const quest of quests) {
        const reward = parseReward(quest.body);
        const missing = [];
        if (quest.assignees.length === 0) missing.push("assignee");
        if (quest.assignees.length > 1) {
            missing.push(`single assignee (found ${quest.assignees.length})`);
        }
        if (reward === null || !Number.isFinite(reward) || reward <= 0) {
            missing.push("valid reward amount in issue body");
        }

        if (missing.length) {
            flags.push({ ...quest, reward, reason: missing.join(", ") });
            continue;
        }

        payouts.push({
            issue: quest.number,
            recipient: quest.assignees[0],
            amount: reward,
            role: "assignee",
        });
    }

    for (const flag of flags) {
        await github.rest.issues.createComment({
            ...repo(context),
            issue_number: flag.number,
            body: [
                `@${process.env.PAYOUT_FALLBACK} — quest payout could not be auto-processed.`,
                "",
                `**Missing:** ${flag.reason}`,
                `- assignees: ${flag.assignees.length ? flag.assignees.join(", ") : "(none)"}`,
                `- parsed reward: ${flag.reward ?? "(unparsed)"}`,
                "",
                `Triggered by merge of #${context.payload.pull_request.number}. Please review and back-fill manually.`,
            ].join("\n"),
        });
    }

    core.setOutput("payouts", JSON.stringify(payouts));
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
            (c) => c.user?.type === "Bot" && c.body?.includes(RECEIPT_MARKER),
        );
}

function buildReceipt(context, issueNumber, rows) {
    const allOk = rows.every(
        (r) => r.status === "granted" || r.status === "duplicate",
    );
    return {
        status: allOk ? "paid_out" : "manual_review",
        quest_issue: Number(issueNumber),
        pr: context.payload.pull_request.number,
        paid_at: allOk ? new Date().toISOString() : null,
        processed_at: new Date().toISOString(),
        recipients: rows.map((r) => ({
            github: r.user,
            role: r.role,
            amount: r.amount,
            status: r.status,
        })),
    };
}

function buildReceiptBody(receipt, rows) {
    const granted = rows.filter((r) => r.status === "granted");
    const duplicate = rows.filter((r) => r.status === "duplicate");
    const notFound = rows.filter((r) => r.status === "not_found");
    const errored = rows.filter((r) => r.status === "error");
    const allOk = receipt.status === "paid_out";

    const lines = [
        RECEIPT_MARKER,
        "```json",
        JSON.stringify(receipt, null, 2),
        "```",
        "",
        allOk
            ? "### 🌸 Quest reward paid out"
            : "### ⚠️ Quest reward needs review",
        "",
    ];
    for (const r of granted) {
        lines.push(`- **${r.amount}** Pollen → @${r.user} (${r.role})`);
    }
    for (const r of duplicate) {
        lines.push(
            `- **${r.amount}** Pollen → @${r.user} (${r.role}) already credited`,
        );
    }
    if (notFound.length) {
        lines.push(
            "",
            `@${process.env.PAYOUT_FALLBACK} — these recipients are not registered at enter.pollinations.ai, please back-fill manually:`,
        );
        for (const r of notFound) {
            lines.push(`- @${r.user} (${r.role}): ${r.amount} Pollen`);
        }
    }
    if (errored.length) {
        lines.push(
            "",
            `@${process.env.PAYOUT_FALLBACK} — D1 grant failed for:`,
        );
        for (const r of errored) {
            lines.push(`- @${r.user} (${r.role}): ${r.amount} Pollen`);
        }
    }

    return lines.join("\n");
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
    const results = parseJsonEnv("RESULTS", []);
    const quests = parseJsonEnv("QUESTS", []);
    const projectId = process.env.PROJECT_ID;
    const byIssue = {};
    for (const result of results) {
        byIssue[result.issue] ||= [];
        byIssue[result.issue].push(result);
    }

    for (const [issueNumber, rows] of Object.entries(byIssue)) {
        const receipt = buildReceipt(args.context, issueNumber, rows);
        await upsertReceiptComment(
            args,
            Number(issueNumber),
            buildReceiptBody(receipt, rows),
        );

        if (receipt.status !== "paid_out") continue;
        const quest = quests.find((q) => q.number === Number(issueNumber));
        if (!quest) continue;

        await setIssueStatus(args, projectId, quest, "Paid Out");
    }
}

function runCommand(command, args, options = {}) {
    const result = spawnSync(command, args, {
        encoding: "utf8",
        stdio: "inherit",
        ...options,
    });
    if (result.status !== 0) {
        throw new Error(`${command} ${args.join(" ")} failed`);
    }
}

function runGrant(enterDir, payout) {
    console.log(
        `→ granting ${payout.amount} Pollen to @${payout.recipient} (${payout.role}) for #${payout.issue}`,
    );
    const result = spawnSync(
        "npx",
        [
            "tsx",
            "src/tier-progression/shared/quest-grant-pollen.ts",
            "grant",
            "--githubUsername",
            payout.recipient,
            "--amount",
            String(payout.amount),
            "--questIssue",
            String(payout.issue),
            "--prNumber",
            String(process.env.PR_NUMBER),
            "--role",
            payout.role,
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
        role: payout.role,
        status: statusByCode[result.status] || "error",
    };
}

async function runPollenGrants({ core }) {
    const payouts = parseJsonEnv("PAYOUTS", []);
    const enterDir = path.join(process.cwd(), "enter.pollinations.ai");
    runCommand("npm", ["install"], { cwd: enterDir });
    core.setOutput(
        "results",
        JSON.stringify(payouts.map((payout) => runGrant(enterDir, payout))),
    );
}

module.exports = {
    computePayouts,
    markPaidOutAndComment,
    resolveLinkedQuests,
    runPollenGrants,
    setQuestStatus,
};
