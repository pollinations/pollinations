#!/usr/bin/env node

// Community app manager: builds the context for one submission, asks the hosted
// agent, checks its report against the evidence it actually had, then writes
// the pre-review comment and status label. DRY_RUN=1 prints instead of writing.
const { execFileSync } = require("node:child_process");
const dns = require("node:dns/promises");
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const path = require("node:path");
const { readApps } = require("../app.js");

const AGENT =
    process.env.AGENT_MODEL ||
    "community/pollinations-ai/community-app-manager";
const RULEBOOK = fs.readFileSync(path.join(__dirname, "REVIEW.md"), "utf8");
const REQUIREMENTS = [
    "works",
    "uses_pollinations",
    "credits_pollinations",
    "screenshot_shows_app",
    "not_already_listed",
    "sign_in",
    "quest_fits",
];
const OPTIONAL = new Set(["sign_in", "quest_fits"]);
const STATUSES = new Set([
    "supported",
    "contradicted",
    "unverified",
    "not_applicable",
]);
// Hosts many unrelated apps share, so a matching host says nothing.
const SHARED_HOSTS = new Set([
    "github.com",
    "huggingface.co",
    "raw.githubusercontent.com",
]);
const MENTION = /pollinations\.ai|@pollinations\/sdk/gi;
const STOP_WORDS = new Set(
    "the and with for pollinations app your you from that this into any one are ai".split(
        " ",
    ),
);

function gh(args) {
    return execFileSync("gh", args, { encoding: "utf8" }).trim();
}

const redact = (value) =>
    String(value ?? "").replace(
        /\b(?:plln_)?sk_[A-Za-z0-9_-]{8,}/g,
        "sk_[redacted]",
    );

// Any address in a private, loopback, link-local, shared, test, benchmark,
// multicast or reserved range, or one that can tunnel to such a range
// (IPv4-mapped, NAT64, 6to4, Teredo), is not public.
function isPublicIp(ip) {
    if (net.isIPv4(ip)) {
        const [a, b, c] = ip.split(".").map(Number);
        return !(
            a === 0 ||
            a === 10 ||
            a === 127 ||
            a >= 224 ||
            (a === 100 && b >= 64 && b <= 127) ||
            (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168) ||
            (a === 192 && b === 0 && (c === 0 || c === 2)) ||
            (a === 198 && (b === 18 || b === 19)) ||
            (a === 198 && b === 51 && c === 100) ||
            (a === 203 && b === 0 && c === 113)
        );
    }
    const v = ip.toLowerCase();
    return !(
        v === "::" ||
        v === "::1" ||
        /^(fc|fd|fe[89ab]|ff)/.test(v) ||
        /^(::ffff:|64:ff9b:|2002:|2001:db8:|2001:0:|2001::)/.test(v)
    );
}

// One GET that connects only to the address we already checked, so a second
// DNS answer cannot point it somewhere else.
function getPinned(url, { address, family }, maxBytes) {
    const lookup = (_host, options, callback) =>
        options?.all
            ? callback(null, [{ address, family }])
            : callback(null, address, family);
    const client = url.protocol === "https:" ? https : http;
    return new Promise((resolve, reject) => {
        const request = client.get(
            url,
            {
                lookup,
                timeout: 15_000,
                headers: { "user-agent": "pollinations-community-app-manager" },
            },
            (res) => {
                const chunks = [];
                let size = 0;
                res.on("data", (chunk) => {
                    size += chunk.length;
                    if (size <= maxBytes) chunks.push(chunk);
                    else res.destroy();
                });
                res.on("close", () =>
                    resolve({
                        status: res.statusCode,
                        location: res.headers.location,
                        text: Buffer.concat(chunks).toString("utf8"),
                    }),
                );
            },
        );
        request.on("timeout", () => request.destroy(new Error("timeout")));
        request.on("error", reject);
    });
}

async function fetchText(url, maxBytes = 600_000) {
    let current = new URL(url);
    for (let hop = 0; hop < 4; hop++) {
        if (!/^https?:$/.test(current.protocol) || current.username)
            throw new Error("not a public http(s) URL");
        const addresses = await dns.lookup(current.hostname, { all: true });
        if (!addresses.length || !addresses.every((a) => isPublicIp(a.address)))
            throw new Error("not a public address");
        const res = await getPinned(current, addresses[0], maxBytes);
        if (res.status >= 300 && res.status < 400 && res.location) {
            current = new URL(res.location, current);
            continue;
        }
        return { url: current.href, status: res.status, text: res.text };
    }
    throw new Error("too many redirects");
}

// Each Pollinations mention with some surrounding code, so the agent can see
// what the code does with it.
function snippets(text, max = 12) {
    const found = new Set();
    for (const match of text.matchAll(MENTION)) {
        const start = Math.max(0, match.index - 80);
        found.add(
            redact(text.slice(start, match.index + 80).replace(/\s+/g, " ")),
        );
        if (found.size === max) break;
    }
    return [...found];
}

async function pageFacts(appUrl, nextId) {
    let page;
    try {
        page = await fetchText(appUrl);
    } catch (error) {
        return [
            { id: nextId(), kind: "page", url: appUrl, error: error.message },
        ];
    }
    const title = page.text.match(/<title[^>]*>([^<]*)/i)?.[1]?.trim() ?? "";
    const facts = [
        {
            id: nextId(),
            kind: "page",
            url: page.url,
            status: page.status,
            title,
            mentions: snippets(page.text),
        },
    ];
    const origin = new URL(page.url).origin;
    const scripts = [...page.text.matchAll(/<script[^>]+src=["']([^"']+)/gi)]
        .map((m) => new URL(m[1], page.url))
        .filter((src) => src.origin === origin)
        .slice(0, 5);
    for (const src of scripts) {
        try {
            const script = await fetchText(src.href);
            const mentions = snippets(script.text);
            if (mentions.length)
                facts.push({
                    id: nextId(),
                    kind: "script",
                    url: src.href,
                    mentions,
                });
        } catch (error) {
            facts.push({
                id: nextId(),
                kind: "script",
                url: src.href,
                error: error.message,
            });
        }
    }
    return facts;
}

function repoFact(repoUrl, nextId) {
    const parts = new URL(repoUrl).pathname.split("/").filter(Boolean);
    const [owner, name] = parts;
    const folder = parts[2] === "tree" ? parts.slice(4).join("/") : "";
    try {
        const repo = `${owner}/${name.replace(/\.git$/, "")}`;
        const branch = gh(["api", `repos/${repo}`, "--jq", ".default_branch"]);
        const files = gh([
            "api",
            `repos/${repo}/git/trees/${branch}?recursive=1`,
            "--jq",
            '.tree[] | select(.type == "blob") | .path',
        ])
            .split("\n")
            .filter((f) => f.startsWith(folder) && !/node_modules\//.test(f))
            .slice(0, 150);
        const base = `https://raw.githubusercontent.com/${repo}/${branch}/`;
        return { id: nextId(), kind: "repo", repo, raw: base, folder, files };
    } catch (error) {
        return {
            id: nextId(),
            kind: "repo",
            url: repoUrl,
            error: error.message,
        };
    }
}

function questFact(number, nextId) {
    try {
        const issue = JSON.parse(
            gh([
                "issue",
                "view",
                number,
                "--repo",
                "pollinations/pollinations",
                "--json",
                "title,state,labels,body",
            ]),
        );
        return {
            id: nextId(),
            kind: "quest",
            number,
            state: issue.state,
            isQuest: issue.labels.some((l) => l.name === "POLLEN-QUEST"),
            title: issue.title,
            body: redact(issue.body).slice(0, 1500),
        };
    } catch (error) {
        return { id: nextId(), kind: "quest", number, error: error.message };
    }
}

const words = (text) =>
    new Set(
        String(text ?? "")
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
    );

function overlap(a, b) {
    const x = words(a);
    const y = words(b);
    if (!x.size || !y.size) return 0;
    let shared = 0;
    for (const w of x) if (y.has(w)) shared++;
    return shared / (x.size + y.size - shared);
}

const hostOf = (url) => {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return "";
    }
};

// A few catalog apps worth comparing: same host, or a similar name and
// description. Finding them is code; judging them is the agent's job.
function relatedApps(submission, apps, max = 5) {
    const host = hostOf(submission.appUrl);
    const text = `${submission.name} ${submission.description}`;
    return apps
        .map((app) => ({
            app,
            score:
                (host && !SHARED_HOSTS.has(host) && hostOf(app.url) === host
                    ? 1
                    : 0) + overlap(text, `${app.name} ${app.description}`),
        }))
        .filter(({ score }) => score >= 0.2)
        .sort((a, b) => b.score - a.score)
        .slice(0, max)
        .map(({ app }, i) => ({
            id: `C${i + 1}`,
            name: app.name,
            url: app.url,
            repositoryUrl: app.repositoryUrl,
            description: app.description,
        }));
}

// The model fails the whole call on an image it cannot download, so a missing
// screenshot becomes a fact instead. The URL is a GitHub or media host:
// parseSubmission accepts nothing else.
async function screenshotError(url) {
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        res.body?.cancel();
        const type = res.headers.get("content-type") ?? "";
        return res.ok && type.startsWith("image/")
            ? null
            : `HTTP ${res.status}`;
    } catch (error) {
        return error.message;
    }
}

async function buildContext(submission, apps, submittedDate) {
    let n = 0;
    const nextId = () => `F${++n}`;
    const facts = [];
    if (submission.appUrl)
        facts.push(...(await pageFacts(submission.appUrl, nextId)));
    if (submission.repoUrl) facts.push(repoFact(submission.repoUrl, nextId));
    if (submission.quest) facts.push(questFact(submission.quest, nextId));
    let screenshot = submission.screenshotUrl || null;
    const error = screenshot && (await screenshotError(screenshot));
    if (error) {
        facts.push({
            id: nextId(),
            kind: "screenshot",
            url: screenshot,
            error,
        });
        screenshot = null;
    }
    return {
        job: "submission",
        app: {
            name: redact(submission.name),
            description: redact(submission.description),
            appUrl: submission.appUrl,
            repoUrl: submission.repoUrl,
            category: submission.category,
            platform: submission.platform,
            quest: submission.quest || null,
            submittedDate: submittedDate ?? null,
        },
        facts,
        related: relatedApps(submission, apps),
        screenshot,
    };
}

async function askAgent(context, screenshotUrl, key, fetchImpl = fetch) {
    const res = await fetchImpl("https://gen.pollinations.ai/v1/responses", {
        method: "POST",
        headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
        },
        body: JSON.stringify({
            model: AGENT,
            input: [
                { role: "system", content: RULEBOOK },
                {
                    role: "user",
                    content: [
                        { type: "input_text", text: JSON.stringify(context) },
                        ...(screenshotUrl
                            ? [
                                  {
                                      type: "input_image",
                                      image_url: screenshotUrl,
                                  },
                              ]
                            : []),
                    ],
                },
            ],
        }),
        signal: AbortSignal.timeout(240_000),
    });
    const body = await res.json();
    if (!res.ok)
        throw new Error(`agent -> ${res.status} ${body.error?.message ?? ""}`);
    const output = body.output ?? [];
    const fetched = output
        .filter((item) => item.type === "function_call")
        .flatMap((item) => {
            try {
                const args = JSON.parse(item.arguments);
                return args.urls ?? [args.url];
            } catch {
                return [];
            }
        })
        .filter(Boolean);
    const text =
        body.output_text ??
        output
            .filter((item) => item.type === "message")
            .flatMap((item) => item.content ?? [])
            .map((part) => part.text ?? "")
            .join("");
    return { text, fetched, usage: body.usage };
}

function parseReport(text) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end < start) throw new Error("the agent returned no JSON");
    const report = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(report.findings))
        throw new Error("the agent returned no findings");
    return report;
}

// Agent text goes into a public comment: no links of any kind, no mentions, no
// HTML, and Markdown punctuation (table pipes included) escaped so it shows as
// plain text. renderComment relies on this: it gets only cleaned text.
const cleanLine = (value, max = 200) =>
    redact(value)
        .replace(
            /\b[a-z][a-z0-9+.-]*:\/\/\S+|\/\/\S+|\bwww\.\S+/gi,
            "(link omitted)",
        )
        .replace(/@/g, "@​")
        .replace(/[<>]/g, "")
        .replace(/\p{Cc}/gu, " ")
        .replace(/[\\`*_[\]()#!~|]/g, "\\$&")
        .trim()
        .slice(0, max);

const sameUrl = (a, b) => a.replace(/\/$/, "") === b.replace(/\/$/, "");

// The agent's claims count only when they cite evidence it actually had: an id
// from the context or a URL it fetched. Everything else becomes unverified.
function checkReport(report, { ids, fetched }) {
    const cited = (item) =>
        ids.has(item) ||
        fetched.some((url) => typeof item === "string" && sameUrl(url, item));
    const findings = REQUIREMENTS.map((requirement) => {
        const raw = report.findings.find((f) => f?.requirement === requirement);
        if (!raw)
            return {
                requirement,
                status: "unverified",
                evidence: [],
                note: "Not assessed.",
            };
        const evidence = (
            Array.isArray(raw.evidence) ? raw.evidence : []
        ).filter(cited);
        let status = STATUSES.has(raw.status) ? raw.status : "unverified";
        if (status === "not_applicable" && !OPTIONAL.has(requirement))
            status = "unverified";
        if (
            (status === "supported" || status === "contradicted") &&
            !evidence.length
        )
            status = "unverified";
        return {
            requirement,
            status,
            evidence,
            note: cleanLine(raw.note, 300),
        };
    });
    const contradicted = findings.some((f) => f.status === "contradicted");
    const list = (value) => (Array.isArray(value) ? value : []);
    return {
        label: contradicted ? "APP-NEEDS-INFO" : "APP-REVIEW",
        findings,
        questions: contradicted
            ? list(report.questions)
                  .map((q) => cleanLine(q))
                  .filter(Boolean)
                  .slice(0, 4)
            : [],
        couldNotCheck: list(report.couldNotCheck)
            .map((c) => cleanLine(c, 300))
            .filter(Boolean)
            .slice(0, 6),
    };
}

const REPO = "repos/pollinations/pollinations";
const MARKER = "<!-- APP_PRE_REVIEW -->";
const STATUS_LABELS = ["APP-NEEDS-INFO", "APP-REVIEW"];
const CHECK_NAMES = {
    works: "Works",
    uses_pollinations: "Uses Pollinations",
    credits_pollinations: "Credits Pollinations",
    screenshot_shows_app: "Screenshot shows the app",
    not_already_listed: "Not already listed",
    sign_in: "Sign-in returns to the app",
    quest_fits: "Quest fits",
};
const STATUS_TEXT = {
    supported: "✅ supported",
    contradicted: "❌ contradicted",
    unverified: "❔ unverified",
    not_applicable: "➖ not applicable",
};
const BADGE_SNIPPET =
    "```markdown\n[![Made with pollinations.ai](https://raw.githubusercontent.com/pollinations/pollinations/main/packages/ui/src/brand/badge-made-with.svg)](https://pollinations.ai/?ref=badge)\n```";

const bullets = (items) => items.map((item) => `- ${item}`).join("\n");

function renderComment({ kind, author, errors = [], result }) {
    const mention = /^[A-Za-z0-9-]+$/.test(author ?? "") ? `@${author} ` : "";
    if (kind === "invalid")
        return `${MARKER}\n## App pre-review: more information needed\n\n${mention}\n\n${bullets(errors)}\n\nEdit the issue with the missing information; the pre-review will run again.`;
    if (kind === "unavailable")
        return `${MARKER}\n## App pre-review unavailable\n\n${mention}The automated check could not finish. A maintainer can rerun the workflow; no submitter action is required yet.`;
    const table = [
        "| Check | Result | Note |",
        "|---|---|---|",
        ...result.findings.map(
            (f) =>
                `| ${CHECK_NAMES[f.requirement]} | ${STATUS_TEXT[f.status]} | ${f.note} |`,
        ),
    ].join("\n");
    const notChecked = result.couldNotCheck.length
        ? `\n\nCould not check:\n\n${bullets(result.couldNotCheck)}`
        : "";
    if (result.label === "APP-REVIEW")
        return `${MARKER}\n## App pre-review: ready for human review\n\n${mention}\n\n${table}${notChecked}\n\nA maintainer can verify the app, confirm the badge or pollinations.ai link is visible, and add \`APP-APPROVED\` to publish it.`;
    const badge = result.findings.some(
        (f) =>
            f.requirement === "credits_pollinations" &&
            f.status === "contradicted",
    )
        ? `\n\nBadge snippet:\n\n${BADGE_SNIPPET}`
        : "";
    return `${MARKER}\n## App pre-review: more information needed\n\n${mention}\n\n${bullets(result.questions)}${badge}\n\n${table}${notChecked}\n\nEdit the issue with the requested information; the pre-review will run again.`;
}

const issueState = (issue) =>
    JSON.parse(
        gh([
            "api",
            `${REPO}/issues/${issue}`,
            "--jq",
            "{body, labels: [.labels[].name]}",
        ]),
    );

// A review that took a while must not overwrite a newer submission or a
// maintainer's approval: the newer run, or the approval, wins.
const changedDuring = (before, after) =>
    before.body !== after.body || after.labels.includes("APP-APPROVED");

function ghWrite(method, endpoint, payload) {
    execFileSync("gh", ["api", "-X", method, endpoint, "--input", "-"], {
        input: JSON.stringify(payload ?? {}),
        encoding: "utf8",
    });
}

function setStatusLabel(issue, label) {
    for (const old of STATUS_LABELS) {
        try {
            ghWrite("DELETE", `${REPO}/issues/${issue}/labels/${old}`);
        } catch {
            // Not on the issue: nothing to remove.
        }
    }
    if (label)
        ghWrite("POST", `${REPO}/issues/${issue}/labels`, { labels: [label] });
}

function upsertComment(issue, botId, body) {
    const ids = gh([
        "api",
        "--paginate",
        `${REPO}/issues/${issue}/comments`,
        "--jq",
        `.[] | select(.user.id == ${Number(botId)} and (.body | contains("${MARKER}"))) | .id`,
    ])
        .split("\n")
        .filter(Boolean);
    if (ids.length)
        ghWrite("PATCH", `${REPO}/issues/comments/${ids.at(-1)}`, { body });
    else ghWrite("POST", `${REPO}/issues/${issue}/comments`, { body });
}

async function main() {
    const issue = process.env.ISSUE_NUMBER;
    const key = process.env.POLLINATIONS_API_KEY;
    const botId = process.env.GH_BOT_ID;
    const dryRun = process.env.DRY_RUN === "1";
    if (!/^\d+$/.test(issue || "") || !key || !process.env.VALIDATION_RESULT)
        throw new Error(
            "ISSUE_NUMBER, POLLINATIONS_API_KEY and VALIDATION_RESULT are required",
        );
    if (!dryRun && !/^\d+$/.test(botId || ""))
        throw new Error("GH_BOT_ID is required unless DRY_RUN=1");
    const started = Date.now();
    const before = issueState(issue);
    // The workflow's validate step passes its result in; locally, run
    // ingestion/validate-submission.js first and pass its output the same way.
    const validation = JSON.parse(process.env.VALIDATION_RESULT || "{}");
    const author = validation.metadata?.githubUsername;
    try {
        if (validation.system_error) throw new Error(validation.system_error);
        let comment;
        let label;
        let report = {};
        if (!validation.valid) {
            label = "APP-NEEDS-INFO";
            report = { formErrors: validation.errors };
            comment = renderComment({
                kind: "invalid",
                author,
                errors: validation.errors,
            });
        } else {
            const { submission, metadata } = validation;
            const context = await buildContext(
                submission,
                readApps(),
                metadata.submittedDate,
            );
            const ids = new Set(
                [...context.facts, ...context.related].map((f) => f.id),
            );
            const answer = await askAgent(context, context.screenshot, key);
            const result = checkReport(parseReport(answer.text), {
                ids,
                fetched: answer.fetched,
            });
            label = result.label;
            report = {
                ...result,
                fetched: answer.fetched,
                usage: answer.usage,
            };
            comment = renderComment({ kind: "report", author, result });
        }
        const seconds = Math.round((Date.now() - started) / 1000);
        console.log(JSON.stringify({ issue, label, ...report, seconds }));
        if (dryRun) {
            console.log(comment);
            return;
        }
        if (changedDuring(before, issueState(issue))) {
            console.log(
                "The issue changed during the review; nothing written.",
            );
            return;
        }
        upsertComment(issue, botId, comment);
        setStatusLabel(issue, label);
    } catch (error) {
        if (!dryRun) {
            try {
                setStatusLabel(issue);
                upsertComment(
                    issue,
                    botId,
                    renderComment({ kind: "unavailable", author }),
                );
            } catch (commentError) {
                console.error(
                    `could not post the failure status: ${commentError.message}`,
                );
            }
        }
        throw error;
    }
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`community app manager: ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = {
    askAgent,
    cleanLine,
    getPinned,
    buildContext,
    changedDuring,
    checkReport,
    isPublicIp,
    parseReport,
    redact,
    relatedApps,
    renderComment,
    snippets,
};
