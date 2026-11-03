#!/usr/bin/env node

// Community app manager, read-only: builds the context for one submission, asks
// the hosted agent, checks its report against the evidence it actually had,
// and prints the result. Nothing is written to GitHub yet.
const { execFileSync } = require("node:child_process");
const dns = require("node:dns/promises");
const fs = require("node:fs");
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

function isPublicIp(ip) {
    if (net.isIPv4(ip)) {
        const [a, b] = ip.split(".").map(Number);
        return !(
            a === 0 ||
            a === 10 ||
            a === 127 ||
            a >= 224 ||
            (a === 100 && b >= 64 && b <= 127) ||
            (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168)
        );
    }
    const v = ip.toLowerCase();
    return !(
        v === "::" ||
        v === "::1" ||
        /^(fc|fd|fe8|fe9|fea|feb)/.test(v) ||
        v.startsWith("::ffff:")
    );
}

// ponytail: checks DNS before each hop, but fetch resolves again (rebinding
// window); the security review after v1 decides whether to pin addresses.
async function fetchText(url, maxBytes = 600_000) {
    let current = new URL(url);
    for (let hop = 0; hop < 4; hop++) {
        if (!/^https?:$/.test(current.protocol) || current.username)
            throw new Error("not a public http(s) URL");
        const addresses = await dns.lookup(current.hostname, { all: true });
        if (!addresses.length || !addresses.every((a) => isPublicIp(a.address)))
            throw new Error("not a public address");
        const res = await fetch(current, {
            redirect: "manual",
            signal: AbortSignal.timeout(15_000),
            headers: { "user-agent": "pollinations-community-app-manager" },
        });
        const location = res.headers.get("location");
        if (res.status >= 300 && res.status < 400 && location) {
            res.body?.cancel();
            current = new URL(location, current);
            continue;
        }
        const text = (await res.text()).slice(0, maxBytes);
        return { url: current.href, status: res.status, text };
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

const cleanLine = (value, max = 200) =>
    redact(value)
        .replace(/https?:\/\/\S+/g, "[link omitted]")
        .replace(/@/g, "@​")
        .replace(/[<>]/g, "")
        .replace(/\p{Cc}/gu, " ")
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

function validationFor(issue) {
    if (process.env.VALIDATION_RESULT)
        return JSON.parse(process.env.VALIDATION_RESULT);
    const author = gh([
        "api",
        `repos/pollinations/pollinations/issues/${issue}`,
        "--jq",
        ".user.login",
    ]);
    try {
        return JSON.parse(
            execFileSync(
                "node",
                [path.join(__dirname, "../ingestion/validate-submission.js")],
                {
                    encoding: "utf8",
                    env: {
                        ...process.env,
                        ISSUE_NUMBER: issue,
                        ISSUE_AUTHOR: author,
                    },
                },
            ),
        );
    } catch (error) {
        // validate-submission.js exits 2 for an invalid form; its output still holds the result.
        return JSON.parse(error.stdout);
    }
}

async function main() {
    const issue = process.env.ISSUE_NUMBER;
    const key = process.env.POLLINATIONS_API_KEY;
    if (!/^\d+$/.test(issue || "") || !key)
        throw new Error("ISSUE_NUMBER and POLLINATIONS_API_KEY are required");
    const started = Date.now();
    const validation = validationFor(issue);
    if (validation.system_error) throw new Error(validation.system_error);
    if (!validation.valid) {
        console.log(
            JSON.stringify({
                issue,
                label: "APP-NEEDS-INFO",
                formErrors: validation.errors,
            }),
        );
        return;
    }
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
    console.log(
        JSON.stringify({
            issue,
            ...result,
            fetched: answer.fetched,
            usage: answer.usage,
            seconds: Math.round((Date.now() - started) / 1000),
        }),
    );
}

if (require.main === module) {
    main().catch((error) => {
        console.error(`community app manager: ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = {
    askAgent,
    buildContext,
    checkReport,
    isPublicIp,
    parseReport,
    redact,
    relatedApps,
    snippets,
};
