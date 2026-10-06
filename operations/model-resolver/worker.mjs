import {
    Agents,
    checkedPath,
    GitHub,
    hash,
    Pipeline,
    proposalMarker,
    publicFinding,
    taskMarker,
} from "./pipeline.mjs";
import { isPublicUrl as safeUrl } from "./public-url.mjs";
import { Workspace } from "./sandbox.mjs";

const TERMINAL = new Set(["complete", "deferred", "rejected", "blocked"]);
const KEY = /^[a-f0-9]{64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const missing = (error) => error.message === "GitHub GET HTTP 404";
const json = (value, status = 200) => Response.json(value, { status });

export const decisionSchema = {
    status: "ready | needs-evidence | deferred | rejected",
    summary: "Bounded factual decision summary",
    followUp: {
        researcher: "discovery | pricing",
        question: "Specific missing evidence",
        sourceUrls: ["https://official-source/path"],
    },
    baseSha: "Exact current main commit from context",
    version: "Exact upstream model version",
    contract: {
        canonicalName: "provider/model",
        aliases: [],
        priceMultiplier: 1,
        paidOnly: true,
        pollinationsGpu: false,
        registryProvider: "Existing registry provider",
        primaryRoute: {
            provider: "Existing integration",
            model: "Exact provider model ID",
            integration:
                "Existing configured connection identifier; no credential or URL",
            deployment: null,
            region: null,
        },
        bestFallbackCandidate: null,
        fallbackDecision: "none | use-candidate",
        fallbackReason:
            "none-verified | outside-v1-provider-scope | capability-gap | capacity-gap | economics-not-approved | candidate-selected",
        fallbackRoute: null,
    },
    paths: ["Exact permitted implementation and maintained test paths"],
    apiChange: false,
    apiContract: null, // If true: problem, before/after methods+paths+schemas+transport, standard, compatibility, defaultsAndErrors, migration.
    checks: [
        {
            id: "capability",
            kind: "capability | billing | fallback | regression",
            cwd: "gen.pollinations.ai | enter.pollinations.ai",
            command: "npx vitest run test/existing.test.ts",
        },
    ],
};

async function optional(github, path) {
    try {
        return await github.request(path);
    } catch (error) {
        if (missing(error)) return null;
        throw error;
    }
}

async function reconciledComment(github, issue, marker, body) {
    try {
        return await GitHub.prototype.comment.call(github, issue, marker, body);
    } catch (error) {
        const recovered = (await github.list(`/issues/${issue}/comments`)).find(
            (comment) => comment.body.includes(marker),
        );
        if (recovered) return recovered;
        throw error;
    }
}

class CoordinatorGitHub extends GitHub {
    constructor(env, storage) {
        super(env);
        this.storage = storage;
    }
    async comment(issue, marker, body) {
        const prior = (await this.list(`/issues/${issue}/comments`)).find(
            (comment) => comment.body.includes(marker),
        );
        if (prior) return prior;
        const key = `comment:${hash([issue, marker])}`;
        if (await this.storage.get(key))
            throw new Error(
                "Previous comment publication needs reconciliation",
            );
        await this.storage.put(key, { attempted: true });
        return reconciledComment(this, issue, marker, body);
    }
}

function findingInput(value) {
    if (
        !value ||
        !KEY.test(value.key ?? "") ||
        typeof value.model !== "string" ||
        value.model.length > 200 ||
        typeof value.summary !== "string" ||
        value.summary.length > 2000 ||
        !Array.isArray(value.sourceUrls) ||
        value.sourceUrls.length > 20 ||
        value.sourceUrls.some((url) => !safeUrl(url)) ||
        JSON.stringify(value).length > 65536
    )
        throw new Error("Invalid research finding");
    return value;
}

async function findProposal(github, key) {
    const marker = proposalMarker(key);
    const issues = [];
    for (const label of ["MODEL-REVIEW", "MODEL-READY"])
        issues.push(
            ...(await github.list(
                `/issues?state=all&labels=${label}&sort=created&direction=desc`,
            )),
        );
    return issues.find(
        (issue) => !issue.pull_request && issue.body?.includes(marker),
    );
}

// All proposal publication runs in the proposal's own serialized Durable Object.
// Persist the intent first and always reconcile the remote marker before retrying.
export async function upsertProposal(storage, github, input) {
    const finding = findingInput(input.finding);
    if (
        !["discovery", "pricing"].includes(input.kind) ||
        !Number.isFinite(Date.parse(input.at))
    )
        throw new Error("Invalid research observation");
    const identity = hash([input.kind, input.at, finding]);
    await storage.put(`evidence:${identity}`, {
        finding,
        kind: input.kind,
        at: input.at,
    });
    const evidence = await storage.list({ prefix: "evidence:" });
    if (evidence.size > 20) {
        const oldest = [...evidence]
            .sort((a, b) => a[1].at.localeCompare(b[1].at))
            .slice(0, evidence.size - 20);
        await storage.delete(oldest.map(([key]) => key));
    }
    let publication = await storage.get("publication");
    if (publication?.key && publication.key !== finding.key)
        throw new Error("Proposal identity conflict");
    let issue = publication?.issue
        ? await github.request(`/issues/${publication.issue}`)
        : await findProposal(github, finding.key);
    if (!issue) {
        if (publication?.intent)
            throw new Error("Previous issue publication needs reconciliation");
        const labels = await github.list("/labels");
        if (!labels.some((label) => label.name === "MODEL-REVIEW"))
            throw new Error("Required MODEL-REVIEW label is unavailable");
        publication = { key: finding.key, intent: true };
        await storage.put("publication", publication);
        const body = publicFinding(finding, input.at, input.kind);
        try {
            issue = await github.request("/issues", "POST", {
                title: `Model evidence: ${finding.model}`,
                body,
                labels: ["MODEL-REVIEW"],
            });
        } catch (error) {
            issue = await findProposal(github, finding.key);
            if (!issue) throw error;
        }
    }
    await storage.put("publication", { key: finding.key, issue: issue.number });
    // Immutable observation markers let repeated runs add evidence without duplicates.
    await github.comment(
        issue.number,
        `<!-- model-observation:${identity} -->`,
        publicFinding(finding, input.at, input.kind),
    );
    return { issue: issue.number, url: issue.html_url };
}

function stub(env, name) {
    return env.MODEL_TASKS.get(env.MODEL_TASKS.idFromName(name));
}

async function invoke(env, name, path, body) {
    const response = await stub(env, name).fetch(
        `https://model-management.internal${path}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        },
    );
    if (!response.ok)
        throw new Error(`Coordinator request HTTP ${response.status}`);
    return response.json();
}

export async function commitCandidate(github, workspace, state, save) {
    const files = await workspace.changes(state);
    for (const file of files) {
        checkedPath(file.path);
        if (
            !state.decision.paths.includes(file.path) ||
            typeof file.content !== "string" ||
            Buffer.byteLength(file.content) > 100000
        )
            throw new Error("Candidate is outside the approved contract");
    }
    const fingerprint = hash(files);
    if (
        state.candidateIntent &&
        state.candidateIntent.fingerprint !== fingerprint
    )
        throw new Error("Candidate bytes changed after commit intent");
    state.candidateIntent ??= {
        fingerprint,
        branch: `model-management/issue-${state.issue}-${state.digest.slice(0, 24)}`,
        date: new Date().toISOString(),
    };
    await save(state);
    const intent = state.candidateIntent;
    if (!intent.sha) {
        const parent = state.parentCandidate?.sha ?? state.decision.baseSha;
        const base = await github.request(`/git/commits/${parent}`);
        const tree = [];
        for (const file of files) {
            const blob = await github.request("/git/blobs", "POST", {
                content: file.content,
                encoding: "utf-8",
            });
            tree.push({
                path: file.path,
                mode: "100644",
                type: "blob",
                sha: blob.sha,
            });
        }
        const createdTree = await github.request("/git/trees", "POST", {
            base_tree: base.tree.sha,
            tree,
        });
        const actor = {
            name: "pollinations-ai",
            email: "pollinations-ai@users.noreply.github.com",
            date: intent.date,
        };
        // Fixed tree, parent, identity and timestamp make a lost commit response replayable.
        intent.commit = {
            message: `feat: implement approved model contract for #${state.issue}\n\n${taskMarker(state.digest)}`,
            tree: createdTree.sha,
            parents: [parent],
            author: actor,
            committer: actor,
        };
        await save(state);
        const commit = await github.request(
            "/git/commits",
            "POST",
            intent.commit,
        );
        intent.sha = commit.sha;
        await save(state);
    }
    const refPath = `/git/ref/heads/${intent.branch}`;
    let ref = await optional(github, refPath);
    if (!ref) {
        // Never move or force an existing branch, including after ambiguous creation.
        await save(state);
        try {
            ref = await github.request("/git/refs", "POST", {
                ref: `refs/heads/${intent.branch}`,
                sha: intent.sha,
            });
        } catch (error) {
            ref = await optional(github, refPath);
            if (!ref) throw error;
        }
    }
    if (
        ref.object.sha !== intent.sha &&
        state.parentCandidate?.sha === ref.object.sha
    ) {
        try {
            ref = await github.request(
                `/git/refs/heads/${intent.branch}`,
                "PATCH",
                { sha: intent.sha, force: false },
            );
        } catch (error) {
            ref = await optional(github, refPath);
            if (!ref || ref.object.sha !== intent.sha) throw error;
        }
    }
    if (ref.object.sha !== intent.sha)
        throw new Error("Candidate branch has a different revision");
    return { sha: intent.sha, branch: intent.branch };
}

export async function publishDraft(github, state, save) {
    if (
        state.verification?.sha !== state.candidate.sha ||
        !state.decision.checks.every((check) =>
            state.verification.checks.some(
                (result) => result.id === check.id && result.exitCode === 0,
            ),
        )
    )
        throw new Error("Candidate verification is incomplete");
    const ref = await github.request(
        `/git/ref/heads/${state.candidate.branch}`,
    );
    if (ref.object.sha !== state.candidate.sha)
        throw new Error("Candidate branch changed after verification");
    const marker = taskMarker(state.digest);
    const reconcile = async () => {
        const rows = await github.list(
            `/pulls?state=all&head=${encodeURIComponent(`${github.repository.split("/")[0]}:${state.candidate.branch}`)}`,
        );
        const matches = rows.filter((pr) => pr.body?.includes(marker));
        if (rows.length !== matches.length)
            throw new Error("Unexpected PR already uses the task branch");
        if (matches.length > 1)
            throw new Error("Multiple draft PRs require reconciliation");
        if (
            matches[0] &&
            (matches[0].head.sha !== state.candidate.sha ||
                matches[0].base.ref !== "main" ||
                !matches[0].draft ||
                matches[0].state !== "open")
        )
            throw new Error("Existing PR differs from verified candidate");
        return matches[0];
    };
    const old = await reconcile();
    if (old) return old;
    if (state.prIntent)
        throw new Error("Previous draft publication needs reconciliation");
    state.prIntent = {
        sha: state.candidate.sha,
        branch: state.candidate.branch,
        marker,
    };
    await save(state);
    try {
        return await github.request("/pulls", "POST", {
            title: `feat: implement approved model contract #${state.issue}`,
            head: state.candidate.branch,
            base: "main",
            draft: true,
            body: `${marker}\n- Implements the approved model decision for #${state.issue}.\n- Candidate: ${state.candidate.sha}.\n- Required maintained checks passed at this revision.\n- Addresses #${state.issue}; human merge and deployment are separate.`,
        });
    } catch (error) {
        const recovered = await reconcile();
        if (recovered) return recovered;
        throw error;
    }
}

export function createServices(storage, env, overrides = {}) {
    const save = (state) => storage.put("task", state);
    const github = overrides.github ?? new CoordinatorGitHub(env, storage);
    const agents = overrides.agents ?? new Agents(env);
    const workspace = overrides.workspace ?? new Workspace(env, save);
    workspace.history = {
        async load(state) {
            if (!env.RESEARCH_EVIDENCE)
                throw new Error(
                    "Private research evidence storage is not configured",
                );
            const day = Date.parse(
                `${state.date ?? state.createdAt.slice(0, 10)}T00:00:00Z`,
            );
            const snapshots = [];
            for (let offset = 8; offset >= 1; offset--) {
                const date = new Date(day - offset * 86400000)
                    .toISOString()
                    .slice(0, 10);
                const stored = await env.RESEARCH_EVIDENCE.get(
                    `discovery/${date}.json`,
                );
                if (stored) {
                    if (stored.size > 2 * 1024 * 1024)
                        throw new Error(
                            "Research history exceeds bounded snapshot size",
                        );
                    snapshots.push(await stored.json());
                }
            }
            return snapshots;
        },
        async retain(state, snapshot) {
            if (!env.RESEARCH_EVIDENCE)
                throw new Error(
                    "Private research evidence storage is not configured",
                );
            if (Buffer.byteLength(snapshot) > 16 * 1024 * 1024)
                throw new Error("Private source evidence exceeds 16 MiB");
            const key = `research/${state.kind}/${hash(state.id)}.json`;
            await env.RESEARCH_EVIDENCE.put(key, snapshot, {
                httpMetadata: { contentType: "application/json" },
            });
            if (state.kind === "discovery" && !state.followUp) {
                const data = JSON.parse(snapshot);
                const baseline = {
                    at: data.at,
                    sources: data.sources.map((source) => ({
                        source: source.source,
                        status: source.status,
                        observations: source.observations.map(
                            ({ id, version, runs, signals }) => ({
                                id,
                                version,
                                runs,
                                signals,
                            }),
                        ),
                    })),
                };
                const bytes = JSON.stringify(baseline);
                if (Buffer.byteLength(bytes) > 2 * 1024 * 1024)
                    throw new Error("Discovery baseline exceeds 2 MiB");
                await env.RESEARCH_EVIDENCE.put(
                    `discovery/${state.date}.json`,
                    bytes,
                    { httpMetadata: { contentType: "application/json" } },
                );
            }
            state.evidenceKey = key;
            await save(state);
        },
    };
    return {
        github,
        agents,
        workspace,
        decisionSchema,
        async evidence(issue) {
            const [record, comments, state] = await Promise.all([
                github.request(`/issues/${issue}`),
                github.list(`/issues/${issue}/comments`),
                storage.get("task"),
            ]);
            const bodies = [
                record.body ?? "",
                ...comments
                    .filter(
                        (comment) =>
                            !comment.body.includes("<!-- model-review:") &&
                            !comment.body.includes("<!-- model-task:") &&
                            !comment.body.startsWith("MODEL-APPROVED "),
                    )
                    .map((comment) => comment.body),
            ];
            const keys = [
                ...new Set(
                    bodies.flatMap((body) =>
                        [
                            ...body.matchAll(
                                /<!-- model-proposal:([a-f0-9]{64}) -->/g,
                            ),
                        ].map((match) => match[1]),
                    ),
                ),
            ];
            if (keys.length > 10)
                throw new Error("Issue references too many proposals");
            const privateEvidence = [];
            for (const key of keys)
                privateEvidence.push(
                    await invoke(env, `proposal:${key}`, "/evidence", { key }),
                );
            return {
                issue: {
                    number: record.number,
                    title: record.title,
                    body: record.body,
                },
                comments: bodies.slice(1),
                records: privateEvidence.flatMap((entry) => entry.observations),
                followUps: state?.followUpReports ?? [],
            };
        },
        async publishResearch(state) {
            if (state.followUp?.issue) {
                const rendered = state.report.findings.map((finding) =>
                    publicFinding(finding, state.report.at, state.kind).replace(
                        `${proposalMarker(finding.key)}\n`,
                        "",
                    ),
                );
                await github.comment(
                    state.followUp.issue,
                    `<!-- model-follow-up:${hash(state.id)} -->`,
                    rendered.join("\n\n") ||
                        "- Follow-up research found no supported new findings; private coverage gaps are retained for Steward review.",
                );
                return;
            }
            state.publications ??= {};
            for (const finding of state.report.findings) {
                state.publications[finding.key] = await invoke(
                    env,
                    `proposal:${finding.key}`,
                    "/proposal",
                    { finding, at: state.report.at, kind: state.kind },
                );
                await save(state);
            }
        },
        async followUp(state) {
            const request = state.decision.followUp;
            const id = `followup:${state.issue}:${state.digest}:${state.attempts + 1}`;
            const result = await invoke(env, id, "/task", {
                id,
                kind: request.researcher,
                followUp: {
                    issue: state.issue,
                    question: request.question,
                    sourceUrls: request.sourceUrls,
                },
            });
            if (
                result.phase === "blocked" ||
                result.phase === "deferred" ||
                result.phase === "rejected"
            )
                throw new Error("Follow-up research requires reconciliation");
            if (result.phase !== "complete") return { pending: true };
            state.followUpReports ??= [];
            if (!state.followUpReports.some((report) => report.id === id))
                state.followUpReports.push({ id, report: result.report });
            const issue = await github.request(`/issues/${state.issue}`);
            const comments = await github.list(
                `/issues/${state.issue}/comments`,
            );
            const keys = [
                ...new Set(
                    [
                        issue.body ?? "",
                        ...comments.map((comment) => comment.body),
                    ].flatMap((body) =>
                        [
                            ...body.matchAll(
                                /<!-- model-proposal:([a-f0-9]{64}) -->/g,
                            ),
                        ].map((match) => match[1]),
                    ),
                ),
            ];
            if (keys.length > 10)
                throw new Error("Too many follow-up evidence destinations");
            for (const key of keys)
                await invoke(env, `proposal:${key}`, "/followup-evidence", {
                    key,
                    id,
                    report: result.report,
                });
            await save(state);
            return { complete: true };
        },
        candidate: (state) => commitCandidate(github, workspace, state, save),
        publishPr: (state) => publishDraft(github, state, save),
    };
}

function taskInput(input) {
    if (
        !input ||
        Object.keys(input).some(
            (key) => !["id", "kind", "issue", "date", "followUp"].includes(key),
        ) ||
        !["issue", "discovery", "pricing"].includes(input.kind) ||
        typeof input.id !== "string" ||
        input.id.length > 180
    )
        throw new Error("Invalid task input");
    if (input.kind === "issue") {
        if (
            !Number.isSafeInteger(input.issue) ||
            input.issue <= 0 ||
            input.id !== `issue:${input.issue}` ||
            input.followUp ||
            input.date
        )
            throw new Error("Invalid issue task identity");
    } else if (input.followUp) {
        const follow = input.followUp;
        if (
            Object.keys(follow).some(
                (key) => !["issue", "question", "sourceUrls"].includes(key),
            ) ||
            !Number.isSafeInteger(follow.issue) ||
            follow.issue <= 0 ||
            typeof follow.question !== "string" ||
            !follow.question.trim() ||
            follow.question.length > 2000 ||
            !Array.isArray(follow.sourceUrls) ||
            !follow.sourceUrls.length ||
            follow.sourceUrls.length > 5 ||
            follow.sourceUrls.some((url) => !safeUrl(url)) ||
            !new RegExp(`^followup:${follow.issue}:[a-f0-9]{64}:[12]$`).test(
                input.id,
            ) ||
            input.date ||
            input.issue
        )
            throw new Error("Invalid follow-up task identity");
    } else if (
        !DAY.test(input.date ?? "") ||
        !Number.isFinite(Date.parse(`${input.date}T00:00:00Z`)) ||
        input.id !== `${input.kind}:${input.date}` ||
        input.issue
    )
        throw new Error("Invalid daily task identity");
    return input;
}

export class ModelManagementTask {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.serial = Promise.resolve();
        // Transcripts and tool receipts exceed SQLite's 2 MiB row ceiling.
        // The DO commits a small pointer after the private R2 snapshot is durable.
        this.tasks = {
            get: async (key) => {
                if (key !== "task") return state.storage.get(key);
                const pointer = await state.storage.get("task");
                if (!pointer) return undefined;
                const object = await env.RESEARCH_EVIDENCE.get(
                    pointer.snapshot,
                );
                if (!object)
                    throw new Error("Durable task snapshot is missing");
                return object.json();
            },
            put: async (key, task) => {
                if (key !== "task") return state.storage.put(key, task);
                if (!env.RESEARCH_EVIDENCE)
                    throw new Error("Private task storage is not configured");
                const bytes = JSON.stringify(task);
                if (Buffer.byteLength(bytes) > 16 * 1024 * 1024)
                    throw new Error(
                        "Task transcript exceeds its bounded snapshot limit",
                    );
                const snapshot = `tasks/${hash(task.id)}/${hash(bytes)}.json`;
                const prior = await state.storage.get("task");
                if (prior?.snapshot === snapshot) return;
                await env.RESEARCH_EVIDENCE.put(snapshot, bytes, {
                    httpMetadata: { contentType: "application/json" },
                });
                await state.storage.put("task", {
                    id: task.id,
                    kind: task.kind,
                    phase: task.phase,
                    spent: task.spent,
                    turns: task.turns,
                    snapshot,
                });
                if (prior?.snapshot)
                    await env.RESEARCH_EVIDENCE.delete(prior.snapshot);
            },
        };
        this.services = createServices(this.tasks, env);
        this.pipeline = new Pipeline(this.tasks, env, this.services);
    }
    exclusive(action) {
        const result = this.serial.then(action);
        this.serial = result.catch(() => {});
        return result;
    }
    async fetch(request) {
        if (this.env.ENABLED !== "true")
            return json({ error: "disabled" }, 503);
        if (
            request.method !== "POST" ||
            request.headers.get("Content-Type") !== "application/json"
        )
            return json({ error: "invalid request" }, 400);
        const length = Number(request.headers.get("Content-Length") ?? 0);
        if (length > 70000) return json({ error: "request too large" }, 413);
        const text = await request.text();
        if (Buffer.byteLength(text) > 70000)
            return json({ error: "request too large" }, 413);
        let input;
        try {
            input = JSON.parse(text);
        } catch {
            return json({ error: "invalid JSON" }, 400);
        }
        const path = new URL(request.url).pathname;
        return this.exclusive(async () => {
            if (path === "/task") {
                try {
                    taskInput(input);
                } catch {
                    return json({ error: "invalid task" }, 400);
                }
                const stored = await this.tasks.get("task");
                if (
                    stored &&
                    (stored.id !== input.id || stored.kind !== input.kind)
                )
                    return json({ error: "identity conflict" }, 409);
                const task = await this.pipeline.initialize({
                    ...input,
                    ...(input.followUp
                        ? {
                              followUpRequest: {
                                  question: input.followUp.question,
                                  sourceUrls: input.followUp.sourceUrls,
                              },
                          }
                        : {}),
                });
                if (
                    task.phase === "blocked" &&
                    task.kind === "issue" &&
                    this.env.GITHUB_TOKEN
                ) {
                    const command = `MODEL-RESUME ${task.digest ?? task.id}`;
                    const comments = await this.services.github.list(
                        `/issues/${task.issue}/comments`,
                    );
                    for (const comment of comments) {
                        if (
                            comment.id <= (task.resumeComment ?? 0) ||
                            comment.user?.type !== "User" ||
                            comment.body.trim() !== command
                        )
                            continue;
                        const access = await this.services.github.request(
                            `/collaborators/${encodeURIComponent(comment.user.login)}/permission`,
                        );
                        if (!["maintain", "admin"].includes(access.permission))
                            continue;
                        if (task.digest) {
                            try {
                                await this.pipeline.approval(task);
                            } catch {
                                break;
                            }
                        }
                        task.resumeComment = comment.id;
                        task.phase = task.failedPhase;
                        delete task.error;
                        delete task.waiting;
                        await this.tasks.put("task", task);
                        break;
                    }
                }
                if (
                    !TERMINAL.has(task.phase) &&
                    (await this.state.storage.getAlarm()) === null
                )
                    await this.state.storage.setAlarm(Date.now() + 1000);
                return json({
                    phase: task.phase,
                    ...(task.phase === "complete" && task.followUp
                        ? { report: task.report }
                        : {}),
                });
            }
            if (path === "/proposal") {
                if (
                    !input ||
                    Object.keys(input).some(
                        (key) => !["finding", "at", "kind"].includes(key),
                    )
                )
                    return json({ error: "invalid proposal" }, 400);
                return json(
                    await upsertProposal(
                        this.state.storage,
                        this.services.github,
                        input,
                    ),
                );
            }
            if (path === "/evidence") {
                if (
                    !input ||
                    Object.keys(input).length !== 1 ||
                    !KEY.test(input.key ?? "")
                )
                    return json({ error: "invalid evidence key" }, 400);
                const rows = [
                    ...(
                        await this.state.storage.list({ prefix: "evidence:" })
                    ).values(),
                ]
                    .sort((a, b) => b.at.localeCompare(a.at))
                    .slice(0, 5);
                if (rows.some((row) => row.finding.key !== input.key))
                    return json({ error: "identity conflict" }, 409);
                const followUps = [
                    ...(
                        await this.state.storage.list({ prefix: "followup:" })
                    ).values(),
                ];
                return json({ key: input.key, observations: rows, followUps });
            }
            if (path === "/followup-evidence") {
                if (
                    !input ||
                    Object.keys(input).some(
                        (key) => !["key", "id", "report"].includes(key),
                    ) ||
                    !KEY.test(input.key ?? "") ||
                    typeof input.id !== "string" ||
                    !/^followup:\d+:[a-f0-9]{64}:[12]$/.test(input.id) ||
                    JSON.stringify(input.report).length > 65536
                )
                    return json({ error: "invalid follow-up evidence" }, 400);
                const publication = await this.state.storage.get("publication");
                if (publication?.key !== input.key)
                    return json({ error: "unknown proposal" }, 409);
                await this.state.storage.put(`followup:${hash(input.id)}`, {
                    id: input.id,
                    report: input.report,
                });
                return json({ retained: true });
            }
            return json({ error: "not found" }, 404);
        });
    }
    async alarm() {
        return this.exclusive(async () => {
            if (this.env.ENABLED !== "true") return;
            const task = await this.tasks.get("task");
            if (!task || TERMINAL.has(task.phase)) return;
            // Save the next wakeup before work; every paid/write operation has its own receipt.
            await this.state.storage.setAlarm(Date.now() + 60000);
            const next = await this.pipeline.advance();
            if (TERMINAL.has(next.phase))
                await this.state.storage.deleteAlarm();
        });
    }
}

export default {
    fetch(request) {
        const path = new URL(request.url).pathname;
        return request.method === "GET" && path === "/health"
            ? json({ status: "ok" })
            : json({ error: "not found" }, 404);
    },
    async scheduled(event, env) {
        if (env.ENABLED !== "true") return;
        const date = new Date(event.scheduledTime).toISOString().slice(0, 10);
        for (const kind of ["discovery", "pricing"])
            await invoke(env, `${kind}:${date}`, "/task", {
                kind,
                id: `${kind}:${date}`,
                date,
            });
        const github = new GitHub(env);
        const issues = new Map();
        for (const label of ["MODEL-REVIEW", "MODEL-READY"]) {
            for (const issue of await github.list(
                `/issues?state=open&labels=${label}`,
            ))
                if (!issue.pull_request) issues.set(issue.number, issue);
        }
        for (const issue of issues.values())
            await invoke(env, `issue:${issue.number}`, "/task", {
                kind: "issue",
                id: `issue:${issue.number}`,
                issue: issue.number,
            });
    },
};
