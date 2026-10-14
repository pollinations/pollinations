/**
 * pr-surgeon — a Pollinations code agent that reviews a pull request and pushes
 * a fix to a new branch.
 *
 * Give it a PR link. It reads the diff, fetches the code around each hunk from
 * the PR head, asks `openai/gpt-6.1-sol` for a short review plus the smallest
 * fix, then clones, writes, commits and pushes that fix in the caller's
 * Pollinations computer (the private sandbox) — or returns the fix with the
 * exact commands when the caller's repository cannot be written to.
 *
 * Design notes:
 * - The pipeline is deterministic code, not a model-driven tool loop, so the
 *   same handler runs in the sandbox, in the unit tests, and in a local runner.
 *   One model call per review; the sandbox does the git work.
 * - The model returns whole files, not a patch: the sandbox git has no
 *   `git apply`, so a patch cannot be applied there. The agent computes the
 *   unified diff itself (in `unifiedDiff`) and shows that to the maintainer.
 * - Every path and branch name is validated against a strict character class
 *   before it reaches the shell, so a model answer cannot inject commands.
 * - The GitHub token is read from `metadata.github_token` or the
 *   `x-github-token` header, so it never enters the prompt and never reaches
 *   the model.
 * - Output follows the Responses shape used by the published timer agent
 *   (JSON, or SSE when `stream` is true), because this agent answers with text
 *   it prepared itself instead of delegating to `respond()`.
 */

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type CommandResult = { stdout: string; stderr: string; exitCode: number };

/** Everything the pipeline needs from its host: network, model, shell. */
export type SurgeonDeps = {
    fetch: FetchLike;
    /** One chat completion billed to the caller. */
    chat: (body: Record<string, unknown>) => Promise<{
        content: string;
        usage?: Record<string, number>;
    }>;
    /** Runs one shell command; the Pollinations computer in production. */
    runCommand: (
        command: string,
        options?: { cwd?: string; stdin?: string },
    ) => Promise<CommandResult>;
    model: string;
};

export type PullRequestRef = { owner: string; repo: string; number: number };

export type ChangedFile = {
    path: string;
    status: "added" | "modified" | "deleted" | "renamed";
    added: number;
    removed: number;
    patch: string;
};

export type PullRequest = {
    ref: PullRequestRef;
    url: string;
    title: string;
    body: string;
    baseRef: string | null;
    headRef: string | null;
    headRepo: string;
    headSha: string | null;
    /** False when the GitHub API call failed, so the head may be unknown. */
    headApiAvailable: boolean;
    files: ChangedFile[];
};

export type Finding = {
    severity: "high" | "medium" | "low";
    file: string;
    line: number | null;
    title: string;
    detail: string;
};

/**
 * One change to one file. The model may return a whole new file (`content`) or
 * the exact snippet to replace (`find`), which keeps its answer small for large
 * files. `resolveEdits` turns either form into the new file content.
 */
export type Edit = {
    path: string;
    find?: string;
    replace?: string;
    content?: string;
};

/** A file the fix writes back, after the edits are resolved. */
export type FileChange = { path: string; content: string; before: string };

export type Review = {
    verdict: "fix" | "no_fix";
    summary: string;
    findings: Finding[];
    branch: string | null;
    commit: string | null;
    edits: Edit[];
};

export type Delivery = {
    status: "pushed" | "patch_only" | "failed";
    branch: string | null;
    /** Repository the branch was pushed to, when a push was attempted. */
    target: string | null;
    commit: string | null;
    diffstat: string | null;
    commands: string[];
    error: string | null;
};

/** Model used when the caller does not name one: the quest's suggested model. */
export const DEFAULT_MODEL = "openai/gpt-6.1-sol";
/** Diff plus context budget handed to the model, in characters. */
const CONTEXT_BUDGET = 90_000;
/** Lines of surrounding code kept on each side of a hunk. */
const CONTEXT_WINDOW = 60;
/** Characters of the PR body kept. */
const BODY_LIMIT = 2_000;
/** Files whose surrounding code is fetched. */
const CONTEXT_FILES = 8;
/** Largest fix the agent will write, in characters. */
const EDIT_BUDGET = 200_000;
/** Files one fix may touch. */
const EDIT_LIMIT = 8;

const GITHUB_PR_URL =
    /github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)\/pull\/(\d+)/;
/** Repository-relative paths only: no absolute paths, no `..`, no shell text. */
const SAFE_PATH = /^[A-Za-z0-9][A-Za-z0-9._\-/+]*$/;
const SAFE_BRANCH = /^[A-Za-z0-9][A-Za-z0-9._\-/]*$/;
const SAFE_REPO = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

export function parsePullRequestUrl(text: string): PullRequestRef | null {
    const match = GITHUB_PR_URL.exec(text.replace(/^git@github\.com:/, ""));
    if (!match) return null;
    return {
        owner: match[1],
        repo: match[2].replace(/\.git$/, ""),
        number: Number(match[3]),
    };
}

/** Collect every string in a Responses `input` value. */
function textOf(value: unknown): string {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map(textOf).join("\n");
    if (value && typeof value === "object") {
        return Object.values(value as Record<string, unknown>)
            .map(textOf)
            .join("\n");
    }
    return "";
}

function statusOf(
    line: string,
    previous: ChangedFile["status"],
): ChangedFile["status"] {
    if (line.startsWith("new file mode")) return "added";
    if (line.startsWith("deleted file mode")) return "deleted";
    if (line.startsWith("rename from")) return "renamed";
    return previous;
}

/** Split a unified diff into files with their patches. */
export function parseUnifiedDiff(diff: string): ChangedFile[] {
    const files: ChangedFile[] = [];
    let current: ChangedFile | null = null;
    for (const line of diff.split("\n")) {
        const header = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
        if (header) {
            current = {
                path: header[2],
                status: "modified",
                added: 0,
                removed: 0,
                patch: `${line}\n`,
            };
            files.push(current);
            continue;
        }
        if (!current) continue;
        current.status = statusOf(line, current.status);
        current.patch += `${line}\n`;
        if (line.startsWith("+") && !line.startsWith("+++")) current.added++;
        if (line.startsWith("-") && !line.startsWith("---")) current.removed++;
    }
    return files;
}

/** New-side line numbers a patch touches, from its hunk headers. */
function touchedLines(file: ChangedFile): number[] {
    const lines: number[] = [];
    for (const match of file.patch.matchAll(
        /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm,
    )) {
        const start = Number(match[1]);
        const count = match[2] === undefined ? 1 : Number(match[2]);
        for (let offset = 0; offset < count; offset++) {
            lines.push(start + offset);
        }
    }
    return lines;
}

/**
 * Fetch the PR head revision of a changed file and return numbered windows
 * around the touched lines, so the model reviews real code and not only hunks.
 */
async function fileContext(
    deps: SurgeonDeps,
    pr: PullRequest,
    file: ChangedFile,
    token: string | null,
): Promise<string> {
    if (file.status === "deleted" || !pr.headSha) return "";
    const source = await headFile(deps, pr, file.path, token);
    if (source === null) return "(context unavailable)";
    const rows = source.split("\n");
    const wanted = new Set<number>();
    for (const line of touchedLines(file)) {
        for (
            let index = line - CONTEXT_WINDOW;
            index <= line + CONTEXT_WINDOW;
            index++
        ) {
            if (index >= 1 && index <= rows.length) wanted.add(index);
        }
    }
    const out: string[] = [];
    let previous = 0;
    for (const line of [...wanted].sort((a, b) => a - b)) {
        if (previous && line !== previous + 1) out.push("…");
        out.push(`${line}: ${rows[line - 1]}`);
        previous = line;
    }
    return out.join("\n");
}

/** One file's content at the PR head, or null when it cannot be read. */
async function headFile(
    deps: SurgeonDeps,
    pr: PullRequest,
    path: string,
    token: string | null,
): Promise<string | null> {
    if (!pr.headSha || !SAFE_PATH.test(path)) return null;
    const response = await deps
        .fetch(
            `https://raw.githubusercontent.com/${pr.headRepo}/${pr.headSha}/${path}`,
            { headers: token ? { authorization: `Bearer ${token}` } : {} },
        )
        .catch(() => null);
    return response?.ok ? await response.text() : null;
}

function linesOf(text: string): string[] {
    if (!text) return [];
    const parts = text.split("\n");
    if (parts[parts.length - 1] === "") parts.pop();
    return parts;
}

/**
 * A minimal unified diff. The sandbox git ships no `git apply`, so the agent
 * writes whole files and reports the change with this instead.
 */
export function unifiedDiff(
    path: string,
    before: string,
    after: string,
): string {
    const a = linesOf(before);
    const b = linesOf(after);
    // Longest common subsequence table over lines.
    const table: number[][] = Array.from({ length: a.length + 1 }, () =>
        new Array<number>(b.length + 1).fill(0),
    );
    for (let i = a.length - 1; i >= 0; i--) {
        for (let j = b.length - 1; j >= 0; j--) {
            table[i][j] =
                a[i] === b[j]
                    ? table[i + 1][j + 1] + 1
                    : Math.max(table[i + 1][j], table[i][j + 1]);
        }
    }
    const ops: Array<{ sign: " " | "-" | "+"; line: string }> = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
            ops.push({ sign: " ", line: a[i] });
            i++;
            j++;
        } else if (table[i + 1][j] >= table[i][j + 1]) {
            ops.push({ sign: "-", line: a[i++] });
        } else {
            ops.push({ sign: "+", line: b[j++] });
        }
    }
    while (i < a.length) ops.push({ sign: "-", line: a[i++] });
    while (j < b.length) ops.push({ sign: "+", line: b[j++] });
    if (!ops.some((op) => op.sign !== " ")) return "";

    const hunks: string[] = [];
    let cursor = 0;
    while (cursor < ops.length) {
        // Skip equal lines until a change with up to three lines of context.
        if (ops[cursor].sign === " ") {
            const rest = ops.slice(cursor);
            const nextChange = rest.findIndex((op) => op.sign !== " ");
            if (nextChange === -1) break;
            if (nextChange > CONTEXT_WINDOW) {
                cursor += nextChange - 3;
                continue;
            }
        }
        const start = Math.max(0, cursor - 3);
        let end = cursor;
        while (end < ops.length) {
            const nextChange = ops
                .slice(end)
                .findIndex((op) => op.sign !== " ");
            if (nextChange === -1) break;
            if (nextChange > 6) break;
            end += nextChange + 1;
        }
        end = Math.min(ops.length, end + 3);
        const slice = ops.slice(start, end);
        const beforeCount = slice.filter((op) => op.sign !== "+").length;
        const afterCount = slice.filter((op) => op.sign !== "-").length;
        const beforeStart = ops
            .slice(0, start)
            .filter((op) => op.sign !== "+").length;
        const afterStart = ops
            .slice(0, start)
            .filter((op) => op.sign !== "-").length;
        hunks.push(
            `@@ -${beforeCount ? beforeStart + 1 : beforeStart},${beforeCount} +${afterCount ? afterStart + 1 : afterStart},${afterCount} @@\n` +
                slice.map((op) => `${op.sign}${op.line}`).join("\n"),
        );
        cursor = end;
    }
    if (!hunks.length) return "";
    return `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n${hunks.join("\n")}\n`;
}

export async function loadPullRequest(
    deps: SurgeonDeps,
    ref: PullRequestRef,
    token: string | null,
): Promise<PullRequest> {
    const headers: Record<string, string> = {
        accept: "application/vnd.github+json",
        "user-agent": "pr-surgeon",
    };
    if (token) headers.authorization = `Bearer ${token}`;
    const metadata = await deps
        .fetch(
            `https://api.github.com/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`,
            { headers },
        )
        .then(async (response) =>
            response.ok
                ? ((await response.json()) as Record<string, unknown>)
                : null,
        )
        .catch(() => null);
    const head = (metadata?.head ?? {}) as {
        ref?: string;
        sha?: string;
        repo?: { full_name?: string };
    };
    const diffResponse = await deps.fetch(
        `https://patch-diff.githubusercontent.com/raw/${ref.owner}/${ref.repo}/pull/${ref.number}.diff`,
        { headers: { "user-agent": "pr-surgeon" } },
    );
    if (!diffResponse.ok) {
        throw new Error(
            `could not read the pull request diff (HTTP ${diffResponse.status})`,
        );
    }
    // The anonymous GitHub API is rate limited, and a failed call leaves both
    // the head repository and the head revision unknown. The patch endpoint is
    // not rate limited, and its last `From <sha>` line is the head commit, so
    // files at the head can still be read when the pull request comes from
    // this same repository.
    let headSha = head.sha?.slice(0, 40) ?? null;
    if (!headSha) {
        const patch = await deps
            .fetch(
                `https://patch-diff.githubusercontent.com/raw/${ref.owner}/${ref.repo}/pull/${ref.number}.patch`,
                { headers: { "user-agent": "pr-surgeon" } },
            )
            .then((response) => (response.ok ? response.text() : ""))
            .catch(() => "");
        for (const match of patch.matchAll(/^From ([0-9a-f]{40}) /gm)) {
            headSha = match[1];
        }
    }
    return {
        ref,
        url: `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}`,
        title: String(metadata?.title ?? ""),
        body: String(metadata?.body ?? "").slice(0, BODY_LIMIT),
        baseRef: (metadata?.base as { ref?: string } | undefined)?.ref ?? null,
        headRef: head.ref ?? null,
        headSha,
        headApiAvailable: metadata !== null,
        headRepo: head.repo?.full_name ?? `${ref.owner}/${ref.repo}`,
        files: parseUnifiedDiff(await diffResponse.text()),
    };
}

export function buildReviewPrompt(pr: PullRequest, context: string[]): string {
    const diff = pr.files
        .map(
            (file) =>
                `### ${file.path} (${file.status}, +${file.added}/-${file.removed})\n${file.patch.trimEnd()}`,
        )
        .join("\n\n");
    const contextBlock = context
        .join("\n\n")
        .slice(0, Math.max(0, CONTEXT_BUDGET - diff.length));
    return `Review this pull request and, when the change is wrong or incomplete, produce the smallest correct fix.

PR: ${pr.url}
Title: ${pr.title || "(the GitHub API returned no title)"}
Base branch: ${pr.baseRef ?? "unknown"} → head branch: ${pr.headRef ?? "unknown"} (${pr.headRepo})
Body:
${pr.body || "(empty)"}

## Diff
${diff}

## Code around the changed lines at the PR head
${contextBlock || "(context unavailable)"}

Answer with JSON only, no surrounding prose and no markdown fence:
{"verdict":"fix"|"no_fix","summary":"one or two sentences a maintainer reads first","findings":[{"severity":"high"|"medium"|"low","file":"path","line":123|null,"title":"short","detail":"why it is wrong, what it breaks, what you checked"}],"branch":"lowercase-branch-name","commit":"imperative one-line commit subject","edits":[{"path":"path/to/file","find":"the exact snippet to replace, copied from the file","replace":"what it becomes"}]}

Rules:
- Report only defects you can point at in this diff. A missing test is a finding only when the change cannot be trusted without one. Do not restate the diff, do not propose stylistic churn, do not invent APIs you were not shown.
- line is the line number in the new file at the PR head, or null.
- When nothing is wrong use "verdict":"no_fix", an empty findings list and no edits.
- An edit carries "find", the exact text to replace, copied character for character from the file. Take it from the numbered context block without the "N: " prefix, and without the leading space, "+" or "-" the diff adds. "find" must appear exactly once in the file; the agent rejects an edit that matches zero or many times. Use "content" instead of "find"/"replace" only when the whole file is short.
- Change as few lines as possible, edit only files this diff already touches plus the test that covers them, and never touch generated files, lockfiles or dependency manifests.`;
}

/** Read the model's JSON answer, tolerating a stray fence or trailing prose. */
export function parseReview(answer: string): Review {
    const start = answer.indexOf("{");
    const end = answer.lastIndexOf("}");
    if (start === -1 || end <= start) {
        throw new Error("the review model returned no JSON object");
    }
    const raw = JSON.parse(answer.slice(start, end + 1)) as Record<
        string,
        unknown
    >;
    const findings = Array.isArray(raw.findings) ? raw.findings : [];
    const edits = (Array.isArray(raw.edits) ? raw.edits : []).flatMap<Edit>(
        (edit) => {
            const item = edit as Record<string, unknown>;
            const path = typeof item.path === "string" ? item.path.trim() : "";
            if (!SAFE_PATH.test(path) || path.includes("..")) return [];
            if (typeof item.content === "string") {
                return [{ path, content: item.content }];
            }
            if (
                typeof item.find === "string" &&
                typeof item.replace === "string"
            ) {
                return [{ path, find: item.find, replace: item.replace }];
            }
            return [];
        },
    );
    return {
        verdict: raw.verdict === "fix" && edits.length ? "fix" : "no_fix",
        summary: String(raw.summary ?? "").trim(),
        findings: findings.map((finding) => {
            const item = finding as Record<string, unknown>;
            return {
                severity:
                    item.severity === "high" || item.severity === "low"
                        ? item.severity
                        : "medium",
                file: String(item.file ?? ""),
                line: typeof item.line === "number" ? item.line : null,
                title: String(item.title ?? ""),
                detail: String(item.detail ?? ""),
            };
        }),
        branch: safeName(raw.branch, SAFE_BRANCH),
        commit: typeof raw.commit === "string" ? raw.commit.trim() : null,
        edits: edits.slice(0, EDIT_LIMIT),
    };
}

function safeName(value: unknown, pattern: RegExp): string | null {
    if (typeof value !== "string") return null;
    const clean = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9/_.-]+/g, "-")
        .replace(/\/{2,}/g, "/")
        .replace(/^[-/]+|[-/]+$/g, "");
    return clean && pattern.test(clean) ? clean : null;
}

function summarize(text: string): string {
    const clipped = text.length > 120 ? `${text.slice(0, 117)}…` : text;
    // Whitespace made visible, because a missed indent is the usual cause.
    return JSON.stringify(clipped).replaceAll(" ", "·");
}

/**
 * Model snippets are sometimes copied straight from the diff, so every line
 * carries a leading space, `+` or `-`. That prefix is not in the file. Strip it
 * only when the snippet fails as written and the stripped form matches once.
 * Returns the text to search for and whether the markers were stripped.
 */
function locate(
    file: string,
    snippet: string,
): { text: string; stripped: boolean } {
    if (!snippet) return { text: snippet, stripped: false };
    if (file.includes(snippet)) return { text: snippet, stripped: false };
    const lines = snippet.split("\n");
    if (!lines.every((line) => !line || /^[+\- ]/.test(line))) {
        return { text: snippet, stripped: false };
    }
    const stripped = lines.map((line) => line.slice(1)).join("\n");
    return file.includes(stripped)
        ? { text: stripped, stripped: true }
        : { text: snippet, stripped: false };
}

/** The same treatment for the replacement text, so the pair stays consistent. */
function undoDiffMarkers(text: string, stripped: boolean): string {
    if (!stripped) return text;
    return text
        .split("\n")
        .map((line) => (line ? line.slice(1) : line))
        .join("\n");
}

/**
 * Resolve every edit into the new content of its file, and build the unified
 * diff the maintainer reads. An edit whose `find` is missing or ambiguous is
 * rejected instead of guessed.
 */
export async function resolveEdits(
    deps: SurgeonDeps,
    pr: PullRequest,
    edits: Edit[],
    token: string | null,
): Promise<{ files: FileChange[]; diff: string; size: number }> {
    const files: FileChange[] = [];
    const blocks: string[] = [];
    let size = 0;
    for (const edit of edits) {
        const before = await headFile(deps, pr, edit.path, token);
        if (before === null) {
            throw new Error(
                `could not read ${edit.path} at the PR head (${pr.headRepo}@${pr.headSha ?? "unknown"}), so no fix can be applied${pr.headApiAvailable ? "" : "; the anonymous GitHub API is rate limited here, so send x-github-token"}`,
            );
        }
        let content = edit.content;
        if (content === undefined) {
            const snippet = edit.find ?? "";
            const { text: find, stripped } = locate(before, snippet);
            const replace = undoDiffMarkers(edit.replace ?? "", stripped);
            const first = before.indexOf(find);
            if (!find || first === -1) {
                throw new Error(
                    `edit for ${edit.path} does not match the file at the PR head: ${summarize(snippet)}`,
                );
            }
            if (before.indexOf(find, first + 1) !== -1) {
                throw new Error(
                    `edit for ${edit.path} matches more than once: ${summarize(snippet)}`,
                );
            }
            content =
                before.slice(0, first) +
                replace +
                before.slice(first + find.length);
            size += replace.length + find.length;
        } else {
            size += content.length;
        }
        if (size > EDIT_BUDGET) {
            throw new Error(
                `the fix is over the ${EDIT_BUDGET} character budget`,
            );
        }
        files.push({ path: edit.path, content, before });
        const block = unifiedDiff(edit.path, before, content);
        if (block) blocks.push(block.trimEnd());
    }
    return { files, diff: blocks.length ? `${blocks.join("\n")}\n` : "", size };
}

function pushUrl(repo: string, token: string | null): string {
    return token
        ? `https://x-access-token:${token}@github.com/${repo}.git`
        : `https://github.com/${repo}.git`;
}

/**
 * Clone the PR head branch into the caller's computer, write the fixed files,
 * commit them on a new branch and push. Sandbox calls: one clone, one write per
 * file, one commit-and-push, one log.
 */
export async function deliverFix(
    deps: SurgeonDeps,
    options: {
        files: FileChange[];
        /** Repository that holds the PR head branch; cloned. */
        source: string;
        /** Repository the fix branch is pushed to; usually the caller's fork. */
        target: string;
        branch: string;
        commit: string;
        headRef: string | null;
        token: string | null;
    },
): Promise<Delivery> {
    const { files, source, target, branch, commit, headRef, token } = options;
    const directory = `/workspace/pr-surgeon-${branch.replace(/[^a-z0-9]+/g, "-")}`;
    const repo = `${directory}/repo`;
    const cloneUrl = pushUrl(source, token);
    const remote = pushUrl(target, token);
    const redact = (value: string) =>
        token ? value.split(token).join("***") : value;
    const commands = [
        // A second review of the same pull request lands in the same directory,
        // and git clone refuses a target that is already there.
        `rm -rf ${repo} && mkdir -p ${directory} && cd ${directory} && git clone --depth 1 --branch ${headRef} ${cloneUrl} repo`,
        ...files.map(
            (file) =>
                `cd ${repo} && mkdir -p $(dirname ${file.path}) && cat > ${file.path}`,
        ),
        // The sandbox has no git identity configured, and a commit without one
        // fails, so both values are passed for this command only.
        `cd ${repo} && git checkout -b ${branch} && git add -A && git -c user.name="pr-surgeon" -c user.email="pr-surgeon@users.noreply.github.com" commit -m ${JSON.stringify(commit)} -m "Prepared by the Pollinations pr-surgeon agent." && git push ${remote} ${branch}`,
    ].map(redact);
    const executed = commands.map((command) =>
        token ? command.split("***").join(token) : command,
    );
    if (!headRef || !SAFE_REPO.test(source) || !SAFE_REPO.test(target)) {
        return {
            status: "patch_only",
            branch,
            target,
            commit: null,
            diffstat: null,
            commands,
            error: "the GitHub API did not return a usable head branch or repository, so nothing was pushed",
        };
    }
    const runCommand = async (command: string, stdin?: string) => {
        try {
            return await deps.runCommand(command, {
                cwd: "/workspace",
                ...(stdin ? { stdin } : {}),
            });
        } catch (error) {
            return {
                stdout: "",
                stderr: redact(String((error as Error).message ?? error)),
                exitCode: 1,
            };
        }
    };
    const run = (index: number, stdin?: string) =>
        runCommand(executed[index], stdin);

    const cloned = await run(0);
    if (cloned.exitCode !== 0) return failed(commands, cloned, target);
    for (let index = 0; index < files.length; index++) {
        const written = await run(index + 1, files[index].content);
        if (written.exitCode !== 0) return failed(commands, written, target);
    }
    let pushed = await run(commands.length - 1);
    if (pushed.exitCode !== 0) {
        // A second review of the same pull request finds its own branch already
        // there, and a plain push is then refused. Replacing that branch is
        // intended, but only against a lease read from the remote just now: a
        // branch that moved in between is rejected by git, not overwritten.
        const head = await runCommand(
            `git ls-remote ${redact(remote)} refs/heads/${branch}`,
        );
        const lease = head.stdout.trim().split(/\s+/)[0] ?? "";
        if (/^[0-9a-f]{40}$/.test(lease)) {
            const forced = `cd ${repo} && git push --force-with-lease=refs/heads/${branch}:${lease} ${remote} ${branch}`;
            commands.push(redact(forced));
            pushed = await runCommand(forced);
        }
    }
    if (pushed.exitCode !== 0) {
        return {
            status: token ? "failed" : "patch_only",
            branch,
            target,
            commit: null,
            diffstat: null,
            commands,
            error: redact(pushed.stderr || pushed.stdout).trim(),
        };
    }
    const log = await deps.runCommand(
        `cd ${repo} && git log -1 --format=%H && git show --stat --oneline HEAD`,
        { cwd: "/workspace" },
    );
    const lines = log.stdout.trim().split("\n");
    return {
        status: "pushed",
        branch,
        target,
        commit: lines[0] ?? null,
        diffstat: lines.slice(1).join("\n"),
        commands,
        error: null,
    };
}

/** The fix itself was unusable, before any sandbox call was made. */
function rejected(reason: string): Delivery {
    return {
        status: "failed",
        branch: null,
        target: null,
        commit: null,
        diffstat: null,
        commands: [],
        error: reason,
    };
}

function failed(
    commands: string[],
    result: CommandResult,
    target: string,
): Delivery {
    return {
        status: "failed",
        branch: null,
        target,
        commit: null,
        diffstat: null,
        commands,
        error: (result.stderr || result.stdout).trim(),
    };
}

export function renderReview(
    pr: PullRequest,
    review: Review,
    delivery: Delivery | null,
    diff: string,
    model: string,
): string {
    const lines: string[] = [`## Review of ${pr.url}`, ""];
    lines.push(review.summary || "(the model returned no summary)");
    if (review.findings.length) {
        lines.push("", "### Findings");
        for (const finding of review.findings) {
            const where = finding.line ? `:${finding.line}` : "";
            lines.push(
                `- **${finding.severity}** \`${finding.file}${where}\` — ${finding.title}: ${finding.detail}`,
            );
        }
    } else {
        lines.push("", "No defects found in this diff.");
    }
    if (!diff && delivery?.error) {
        lines.push("", "### Fix rejected", delivery.error);
    } else if (!diff) {
        lines.push("", "No fix prepared.");
    } else if (delivery?.status === "pushed") {
        lines.push(
            "",
            "### Fix pushed",
            `Branch \`${delivery.branch}\` on \`${delivery.target ?? pr.headRepo}\` at \`${delivery.commit}\`.`,
            "",
            "```",
            delivery.diffstat ?? "",
            "```",
            "",
            "```diff",
            diff.trimEnd(),
            "```",
        );
    } else {
        lines.push(
            "",
            "### Fix prepared, not pushed",
            delivery?.error
                ? `Push reported: ${delivery.error}`
                : "No GitHub credential was supplied, so the fix and its commands are returned for the caller to push.",
            "",
            "```diff",
            diff.trimEnd(),
            "```",
            "",
            "Apply it with:",
            "",
            "```bash",
            ...(delivery?.commands ?? []).map((command) =>
                command.replace(/\n[\s\S]*$/, ""),
            ),
            "```",
        );
    }
    lines.push("", `_model ${model}_`);
    return lines.join("\n");
}

function usageOf(usage: Record<string, number> | undefined) {
    const input = Number(usage?.prompt_tokens ?? 0);
    const output = Number(usage?.completion_tokens ?? 0);
    return {
        input_tokens: input,
        output_tokens: output,
        total_tokens: Number(usage?.total_tokens ?? input + output),
    };
}

function responseObject(
    model: string,
    text: string,
    usage: Record<string, number> | undefined,
) {
    return {
        id: `resp_${crypto.randomUUID()}`,
        object: "response",
        created_at: Math.floor(Date.now() / 1000),
        completed_at: Math.floor(Date.now() / 1000),
        model,
        status: "completed",
        error: null,
        incomplete_details: null,
        output: [
            {
                id: `msg_${crypto.randomUUID()}`,
                type: "message",
                status: "completed",
                role: "assistant",
                content: [{ type: "output_text", text, annotations: [] }],
            },
        ],
        usage: usageOf(usage),
    };
}

function streamResponse(response: Record<string, unknown>): Response {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
        start(controller) {
            let sequence = 0;
            const emit = (type: string, fields: Record<string, unknown>) => {
                const event = { type, sequence_number: sequence++, ...fields };
                controller.enqueue(
                    encoder.encode(
                        `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`,
                    ),
                );
            };
            const message = (response.output as Record<string, unknown>[])[0];
            const part = (message.content as Record<string, unknown>[])[0];
            const indices = {
                item_id: message.id,
                output_index: 0,
                content_index: 0,
            };
            emit("response.created", { response });
            emit("response.in_progress", { response });
            emit("response.output_item.added", {
                output_index: 0,
                item: { ...message, content: [] },
            });
            emit("response.content_part.added", { ...indices, part });
            emit("response.output_text.delta", {
                ...indices,
                delta: part.text,
                logprobs: [],
            });
            emit("response.output_text.done", {
                ...indices,
                text: part.text,
                logprobs: [],
            });
            emit("response.content_part.done", { ...indices, part });
            emit("response.output_item.done", {
                output_index: 0,
                item: message,
            });
            emit("response.completed", { response });
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
        },
    });
    return new Response(body, {
        headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
        },
    });
}

function errorResponse(message: string, code: string, status = 400): Response {
    return Response.json(
        { error: { message, type: "invalid_request_error", code } },
        { status },
    );
}

export type AgentContext = {
    request: Request;
    pollinations: (path: string, init?: RequestInit) => Promise<Response>;
    mcp: (
        server: string,
        tool: string,
        args: Record<string, unknown>,
    ) => Promise<unknown>;
    /** Outbound HTTP for GitHub. Tests and runners may replace it. */
    fetch?: FetchLike;
};

/**
 * The agent entry point. `pollinations` performs the model call on the caller's
 * Pollen; `mcp("computer", "bash", …)` performs the git work.
 */
export default async function agent(context: AgentContext): Promise<Response> {
    const { request, pollinations, mcp } = context;
    const outbound: FetchLike = context.fetch ?? ((url, init) => fetch(url, init));
    const body = (await request.json().catch(() => ({}))) as Record<
        string,
        unknown
    >;
    const metadata = (body.metadata ?? {}) as Record<string, string>;
    const token =
        (metadata.github_token ?? request.headers.get("x-github-token") ?? "")
            .trim() || null;
    const model = metadata.model ?? DEFAULT_MODEL;
    const stream = body.stream === true;

    const ref = parsePullRequestUrl(textOf(body.input));
    if (!ref) {
        return errorResponse(
            "Send a GitHub pull request link, for example https://github.com/owner/repo/pull/123.",
            "missing_pull_request",
        );
    }

    const deps: SurgeonDeps = {
        fetch: outbound,
        chat: async (payload) => {
            const response = await pollinations("/v1/chat/completions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = (await response.json()) as {
                choices?: { message?: { content?: string } }[];
                usage?: Record<string, number>;
                error?: { message?: string };
            };
            const content = data.choices?.[0]?.message?.content;
            if (!response.ok || !content) {
                throw new Error(
                    `the review model answered HTTP ${response.status}: ${(data.error?.message ?? "").slice(0, 200)}`,
                );
            }
            return { content, usage: data.usage };
        },
        runCommand: async (command, options = {}) => {
            const result = (await mcp("computer", "bash", {
                command,
                ...(options.stdin ? { stdin: options.stdin } : {}),
                cwd: options.cwd ?? "/workspace",
            })) as { content?: { text?: string }[]; isError?: boolean };
            const text = (result?.content ?? [])
                .map((part) => part.text ?? "")
                .join("\n");
            return {
                stdout: result?.isError ? "" : text,
                stderr: result?.isError ? text : "",
                exitCode: result?.isError ? 1 : 0,
            };
        },
        model,
    };

    try {
        const pr = await loadPullRequest(deps, ref, token);
        const contextBlocks: string[] = [];
        for (const file of pr.files.slice(0, CONTEXT_FILES)) {
            const block = await fileContext(deps, pr, file, token);
            if (block) contextBlocks.push(`### ${file.path}\n${block}`);
        }
        const answer = await deps.chat({
            model,
            max_tokens: 12_000,
            messages: [
                {
                    role: "system",
                    content:
                        "You are a precise pull request reviewer. You find real defects in the change you are shown and you write minimal, correct fixes. You never invent repository context and you answer with JSON only.",
                },
                { role: "user", content: buildReviewPrompt(pr, contextBlocks) },
            ],
        });
        const review = parseReview(answer.content);
        let fix: { files: FileChange[]; diff: string; size: number } = {
            files: [],
            diff: "",
            size: 0,
        };
        let delivery: Delivery | null = null;
        if (review.edits.length) {
            try {
                fix = await resolveEdits(deps, pr, review.edits, token);
            } catch (error) {
                // A fix that does not apply is reported, never guessed at.
                delivery = rejected(String((error as Error).message ?? error));
            }
        }
        // `metadata.review_only` keeps the caller's repository untouched.
        if (fix.diff && metadata.review_only !== "1") {
            delivery = await deliverFix(deps, {
                files: fix.files,
                source: pr.headRepo,
                target: metadata.push_repo ?? pr.headRepo,
                branch: review.branch ?? `pr-surgeon/${ref.number}-fix`,
                commit: review.commit ?? `Fix review findings in PR #${ref.number}`,
                headRef: pr.headRef,
                token,
            });
        }

        const response = responseObject(
            model,
            renderReview(pr, review, delivery, fix.diff, model),
            answer.usage,
        );
        return stream ? streamResponse(response) : Response.json(response);
    } catch (error) {
        return errorResponse(
            String((error as Error).message ?? error),
            "agent_error",
            502,
        );
    }
}
