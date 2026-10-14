/**
 * PullFix — a Pollinations code agent that reviews a pull request and
 * pushes a proposed fix to a branch.
 *
 * Give it a PR link. It fetches the PR metadata, the diff, and the code
 * around every hunk from the public GitHub REST API, asks
 * `openai/gpt-6.1-sol` for a short review plus — when findings are
 * mechanical — complete fixed file contents, then pushes one fix commit
 * onto a `pr-fixer/<number>` branch in a repository you control
 * (a fork of the PR's repository works). A maintainer reads the review
 * and a ready diff, nothing else.
 *
 * Design notes:
 * - Reading GitHub is deterministic agent work: plain `fetch`, no auth for
 *   public repositories, no browsing by the model. The model reviews.
 * - Pushing needs credentials the platform does not give agents: the
 *   caller passes a fine-grained GitHub token scoped to the target
 *   repository with the request. `push_to` names the repository
 *   (default: the PR's base repository).
 * - The fix branch is based on the PR state itself: the branch is created
 *   at the push target, the PR head is merged in through GitHub's merge
 *   API, and the fix commit lands on top — so the diff between the two
 *   is exactly the proposed fix.
 * - The review call is one model request; usage is read from the response
 *   and the cost at catalog prices is reported with the review.
 */

type AgentContext = {
    request: Request;
    pollinations: (path: string, init?: RequestInit) => Promise<Response>;
    model: (id: string) => unknown;
    respond: (config: Record<string, unknown>) => Promise<Response>;
};

type PullRequestRef = { owner: string; repo: string; number: number };

type PrFile = {
    filename: string;
    status: string;
    patch?: string;
    previous_filename?: string;
};

type PrData = {
    title: string;
    body: string;
    htmlUrl: string;
    baseOwner: string;
    baseRepo: string;
    headOwner: string;
    headRepo: string;
    headBranch: string;
    headSha: string;
    files: PrFile[];
};

type Finding = {
    severity: "blocker" | "major" | "minor" | "nit";
    file: string;
    line?: number;
    what: string;
    why: string;
    confidence?: "high" | "medium" | "low";
};

type PatchedFile = { path: string; content: string };

type ReviewResult = {
    verdict: "clean" | "issues";
    summary: string;
    findings: Finding[];
    patched_files: PatchedFile[];
};

/** Review model and catalog prices (Pollen per token), per quest #17245. */
const REVIEW_MODEL = "openai/gpt-6.1-sol";
const PROMPT_TOKEN_PRICE = 0.000002;
const COMPLETION_TOKEN_PRICE = 0.00001;
const GITHUB_API = "https://api.github.com";
/** How many changed files a review covers; the rest are summarized. */
const MAX_FILES = 10;
/** Context bytes fetched per file (whole file when smaller). */
const MAX_FILE_BYTES = 120_000;
/** Lines of context kept around each hunk for large files. */
const HUNK_CONTEXT_LINES = 40;
const MAX_OUTPUT_TOKENS = 16_000;

// ---------------------------------------------------------------------------
// Input parsing
// ---------------------------------------------------------------------------

/** Accepts `https://github.com/o/r/pull/123` or bare `github.com/o/r/pull/123`. */
export function parsePrUrl(value: string): PullRequestRef | null {
    const match = value.match(/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/);
    if (!match) return null;
    const number = Number(match[3]);
    if (!Number.isFinite(number) || number <= 0) return null;
    return { owner: match[1], repo: match[2], number };
}

export type AgentInput = {
    pr: PullRequestRef | null;
    githubToken?: string;
    pushTo?: string;
    pushBranch?: string;
    model?: string;
};

/**
 * The agent's message is a PR link, optionally a JSON object that adds
 * `github_token`, `push_to` (`owner/repo`), `push_branch` and `model`.
 * Both shapes work:
 *   "https://github.com/pollinations/pollinations/pull/17422"
 *   {"pr":"https://github.com/o/r/pull/1","push_to":"me/o","github_token":"..."}
 */
export function parseAgentInput(text: string): AgentInput {
    const trimmed = text.trim();
    let candidate = trimmed;
    if (candidate.startsWith("```")) {
        candidate = candidate
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/, "")
            .trim();
    }
    try {
        const parsed = JSON.parse(candidate) as Record<string, unknown>;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return {
                pr:
                    typeof parsed.pr === "string" ||
                    typeof parsed.url === "string"
                        ? parsePrUrl(String(parsed.pr ?? parsed.url))
                        : null,
                githubToken:
                    typeof parsed.github_token === "string"
                        ? parsed.github_token
                        : undefined,
                pushTo:
                    typeof parsed.push_to === "string"
                        ? parsed.push_to
                        : undefined,
                pushBranch:
                    typeof parsed.push_branch === "string"
                        ? parsed.push_branch
                        : undefined,
                model:
                    typeof parsed.model === "string" ? parsed.model : undefined,
            };
        }
    } catch {
        // Not JSON — fall through to plain text.
    }
    return { pr: parsePrUrl(trimmed) };
}

/** The last user message from a chat-completions or Responses request body. */
export function lastUserText(body: Record<string, unknown>): string {
    const textOf = (value: unknown): string => {
        if (typeof value === "string") return value;
        if (Array.isArray(value)) return value.map(textOf).join("\n");
        if (value && typeof value === "object") {
            const item = value as Record<string, unknown>;
            if (item.type === "output_text" || item.type === "text")
                return typeof item.text === "string" ? item.text : "";
            return textOf(item.content ?? item.input ?? item.text);
        }
        return "";
    };
    const messages = body.messages as unknown[] | undefined;
    if (Array.isArray(messages)) {
        for (let i = messages.length - 1; i >= 0; i--) {
            const message = messages[i] as Record<string, unknown> | null;
            if (message && message.role === "user")
                return textOf(message.content);
        }
    }
    return textOf(body.input);
}

// ---------------------------------------------------------------------------
// Diff context
// ---------------------------------------------------------------------------

/** New-file line ranges touched by a unified diff (`@@ -a,b +c,d @@`). */
export function hunkLineRanges(patch: string): Array<[number, number]> {
    const ranges: Array<[number, number]> = [];
    for (const match of patch.matchAll(
        /^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,(\d+))?\s+@@/gm,
    )) {
        const start = Number(match[1]);
        const count = match[2] === undefined ? 1 : Number(match[2]);
        if (Number.isFinite(start) && Number.isFinite(count) && count > 0)
            ranges.push([start, start + count - 1]);
    }
    return ranges;
}

/**
 * Context the model sees for one file: the whole file when it fits,
 * otherwise the hunks with surrounding lines. Line numbers match the
 * PR head version the diff applies to.
 */
export function selectContext(fullText: string, patch: string): string {
    const lines = fullText.split("\n");
    if (fullText.length <= MAX_FILE_BYTES) {
        return lines.map((line, i) => `${i + 1}\t${line}`).join("\n");
    }
    const ranges = hunkLineRanges(patch);
    if (!ranges.length) {
        return lines
            .slice(0, Math.ceil(MAX_FILE_BYTES / 40))
            .map((line, i) => `${i + 1}\t${line}`)
            .join("\n");
    }
    const keep = new Set<number>();
    for (const [start, end] of ranges) {
        const from = Math.max(1, start - HUNK_CONTEXT_LINES);
        const to = Math.min(lines.length, end + HUNK_CONTEXT_LINES);
        for (let i = from; i <= to; i++) keep.add(i);
    }
    const selected: string[] = [];
    let previous = 0;
    for (const lineNumber of [...keep].sort((a, b) => a - b)) {
        if (previous && lineNumber > previous + 1) selected.push("…");
        selected.push(`${lineNumber}\t${lines[lineNumber - 1]}`);
        previous = lineNumber;
    }
    return selected.join("\n");
}

// ---------------------------------------------------------------------------
// Review prompt and output
// ---------------------------------------------------------------------------

export function buildReviewPrompt(
    pr: PrData,
    contexts: Array<{ file: PrFile; context: string | null }>,
): string {
    const files = contexts
        .map(({ file, context }) => {
            const header = `### ${file.filename} (${file.status}${file.previous_filename ? ` from ${file.previous_filename}` : ""})`;
            const patch = file.patch
                ? `\nDiff:\n\`\`\`diff\n${file.patch}\n\`\`\``
                : "\nDiff: (binary or too large to inline)";
            const around = context
                ? `\nCurrent file at the PR head (line-numbered):\n\`\`\`\n${context}\n\`\`\``
                : "";
            return `${header}${patch}${around}`;
        })
        .join("\n\n");
    const description = pr.body
        ? `\n\nPR description:\n${pr.body.slice(0, 4000)}`
        : "";
    return [
        `Pull request ${pr.htmlUrl}: ${pr.title}`,
        `Target: ${pr.baseOwner}/${pr.baseRepo} branch ${pr.baseRef}, head ${pr.headOwner}:${pr.headBranch} at ${pr.headSha.slice(0, 10)}.${description}`,
        "",
        "Changed files:",
        files,
    ].join("\n");
}

export const REVIEW_INSTRUCTIONS = `You review pull requests. Be rigorous and terse; you are read by a maintainer who wants the truth fast.

Priorities, in order: correctness bugs, security, regressions and data loss, concurrency, performance, API compatibility, missing tests, maintainability. Never invent repository context beyond the diff and the code around it; state assumptions. If the change is fine, say so in one line and mark verdict "clean" — do not invent findings to seem useful.

Answer with ONLY a JSON object, no prose around it:
{
  "verdict": "clean" | "issues",
  "summary": "1-3 sentences: what the PR does and your overall judgement",
  "findings": [
    {
      "severity": "blocker" | "major" | "minor" | "nit",
      "file": "path/from/diff",
      "line": 123,
      "what": "the problem, cited to the code you were shown",
      "why": "the consequence if merged",
      "confidence": "high" | "medium" | "low"
    }
  ],
  "patched_files": [
    { "path": "path/from/diff", "content": "complete fixed file content" }
  ],
  "notes": "optional: anything a maintainer should know"
}

patched_files rules:
- Include a file ONLY for findings that are mechanical to fix (typos, wrong constant, missing check, incorrect logic in the shown code). For design-level findings, describe the fix in "what" instead.
- "content" is the complete file as it should be after the fix, based on the PR-head version you were shown. Keep every other line identical.
- If verdict is "clean" or nothing is mechanically fixable, return an empty array.`;

/** Extracts JSON from a model answer, tolerating code fences and stray prose. */
export function parseModelReview(text: string): ReviewResult {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidates = [fenced?.[1], text];
    for (const candidate of candidates) {
        if (!candidate) continue;
        const start = candidate.indexOf("{");
        const end = candidate.lastIndexOf("}");
        if (start === -1 || end <= start) continue;
        try {
            const parsed = JSON.parse(
                candidate.slice(start, end + 1),
            ) as ReviewResult;
            if (
                (parsed.verdict === "clean" || parsed.verdict === "issues") &&
                Array.isArray(parsed.findings) &&
                Array.isArray(parsed.patched_files)
            ) {
                return {
                    verdict: parsed.verdict,
                    summary: String(parsed.summary ?? ""),
                    findings: parsed.findings.filter(
                        (f) =>
                            f &&
                            typeof f.file === "string" &&
                            typeof f.what === "string",
                    ),
                    patched_files: parsed.patched_files.filter(
                        (p) =>
                            p &&
                            typeof p.path === "string" &&
                            typeof p.content === "string",
                    ),
                };
            }
        } catch {
            // Try the next candidate.
        }
    }
    throw new Error("Review model did not return valid JSON");
}

/** The text of a Responses-API JSON body. */
export function outputTextOf(value: unknown): string {
    if (!value || typeof value !== "object") return "";
    const record = value as Record<string, unknown>;
    if (typeof record.output_text === "string") return record.output_text;
    const parts: string[] = [];
    for (const item of Array.isArray(record.output) ? record.output : []) {
        if (!item || typeof item !== "object") continue;
        const entry = item as Record<string, unknown>;
        for (const content of Array.isArray(entry.content)
            ? entry.content
            : []) {
            if (!content || typeof content !== "object") continue;
            const block = content as Record<string, unknown>;
            if (block.type === "output_text" && typeof block.text === "string")
                parts.push(block.text);
        }
    }
    return parts.join("\n");
}

export function usageOf(value: unknown): {
    inputTokens: number;
    outputTokens: number;
} {
    const record =
        value && typeof value === "object"
            ? (value as Record<string, unknown>)
            : undefined;
    const usage = record?.usage as Record<string, unknown> | undefined;
    return {
        inputTokens: Number(usage?.input_tokens ?? 0) || 0,
        outputTokens: Number(usage?.output_tokens ?? 0) || 0,
    };
}

export function estimatedCost(usage: {
    inputTokens: number;
    outputTokens: number;
}): number {
    return (
        usage.inputTokens * PROMPT_TOKEN_PRICE +
        usage.outputTokens * COMPLETION_TOKEN_PRICE
    );
}

// ---------------------------------------------------------------------------
// Review rendering
// ---------------------------------------------------------------------------

type PushInfo =
    | { branch: string; url: string; files: string[] }
    | { skipped: string };

export function reviewToMarkdown(
    review: ReviewResult,
    info: {
        model: string;
        cost: number;
        usage: { inputTokens: number; outputTokens: number };
        pushed?: PushInfo;
    },
): string {
    const lines: string[] = [];
    lines.push(
        `**${review.verdict === "clean" ? "No issues found" : "Issues found"}** — ${review.summary}`,
    );
    if (review.findings.length) {
        lines.push("");
        lines.push("| Severity | File | What | Why |");
        lines.push("|---|---|---|---|");
        for (const f of review.findings) {
            const at = f.line ? `:${f.line}` : "";
            lines.push(
                `| ${f.severity} | \`${f.file}${at}\` | ${escapeCell(f.what)} | ${escapeCell(f.why)} |`,
            );
        }
    }
    if (info.pushed && "branch" in info.pushed) {
        lines.push("");
        lines.push(
            `**Proposed fix** pushed to [\`${info.pushed.branch}\`](${info.pushed.url}) — ${info.pushed.files.length} file(s) changed: ${info.pushed.files.map((f) => `\`${f}\``).join(", ")}.`,
        );
    } else if (info.pushed && "skipped" in info.pushed) {
        lines.push("");
        lines.push(`No fix pushed — ${info.pushed.skipped}`);
    }
    lines.push("");
    lines.push(
        `_Review by ${info.model}: ${info.usage.inputTokens.toLocaleString()} in / ${info.usage.outputTokens.toLocaleString()} out tokens, ≈${info.cost.toFixed(4)} Pollen._`,
    );
    return lines.join("\n");
}

function escapeCell(text: string): string {
    return text.replaceAll("|", "\\|").replaceAll("\n", " ");
}

// ---------------------------------------------------------------------------
// GitHub access
// ---------------------------------------------------------------------------

async function githubFetch(
    path: string,
    token?: string,
    init?: RequestInit,
): Promise<Response> {
    const headers = new Headers(init?.headers);
    headers.set(
        "accept",
        headers.get("accept") ?? "application/vnd.github+json",
    );
    if (token) headers.set("authorization", `Bearer ${token}`);
    const response = await fetch(`${GITHUB_API}${path}`, { ...init, headers });
    if (response.status === 403 || response.status === 429) {
        const reset = response.headers.get("x-ratelimit-reset");
        const minutes = reset
            ? Math.max(
                  1,
                  Math.round((Number(reset) * 1000 - Date.now()) / 60_000),
              )
            : "a few";
        throw new Error(
            `GitHub API rate limit hit — retry in ~${minutes} minutes${token ? "" : " (pass a github_token to raise it)"}`,
        );
    }
    return response;
}

async function fetchPullRequest(pr: PullRequestRef): Promise<PrData> {
    const response = await githubFetch(
        `/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}`,
    );
    if (response.status === 404)
        throw new Error(`PR not found: ${pr.owner}/${pr.repo}#${pr.number}`);
    if (!response.ok)
        throw new Error(`GitHub PR fetch failed (${response.status})`);
    const data = (await response.json()) as Record<string, unknown>;
    const base = data.base as Record<string, unknown> | undefined;
    const head = data.head as Record<string, unknown> | undefined;
    const baseRepo = base?.repo as Record<string, unknown> | undefined;
    const headRepo = head?.repo as Record<string, unknown> | undefined;
    if (
        !base?.ref ||
        !head?.sha ||
        !baseRepo?.full_name ||
        !headRepo?.full_name
    )
        throw new Error("GitHub PR payload missing base/head fields");
    const filesResponse = await githubFetch(
        `/repos/${pr.owner}/${pr.repo}/pulls/${pr.number}/files?per_page=100`,
    );
    if (!filesResponse.ok)
        throw new Error(
            `GitHub PR files fetch failed (${filesResponse.status})`,
        );
    const files = (await filesResponse.json()) as PrFile[];
    return {
        title: String(data.title ?? ""),
        body: String(data.body ?? ""),
        htmlUrl: String(data.html_url ?? ""),
        baseRef: String(base.ref),
        baseOwner: String(baseRepo.full_name).split("/")[0],
        baseRepo: String(baseRepo.full_name).split("/")[1],
        headOwner: String(headRepo.full_name).split("/")[0],
        headRepo: String(headRepo.full_name).split("/")[1],
        headBranch: String(head.ref),
        headSha: String(head.sha),
        files: files.filter((f) => f && typeof f.filename === "string"),
    };
}

/** File content at the PR head, for review context; null when unavailable. */
async function fetchFileContext(
    pr: PrData,
    file: PrFile,
): Promise<string | null> {
    if (file.status === "removed") return null;
    try {
        const response = await fetch(
            `https://raw.githubusercontent.com/${pr.headOwner}/${pr.headRepo}/${pr.headSha}/${file.filename}`,
            { signal: AbortSignal.timeout(20_000) },
        );
        if (!response.ok) return null;
        const text = await response.text();
        if (text.length > MAX_FILE_BYTES * 3) return null;
        return text;
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Pushing the fix (GitHub Git Data + Merges API)
// ---------------------------------------------------------------------------

export function pushBranchName(number: number): string {
    return `pr-fixer/${number}`;
}

/**
 * Pushes one commit with the patched files on top of the PR state, inside a
 * repository the token controls. The PR head is merged into the new branch
 * first, so the branch diff against the PR is exactly the fix.
 */
async function pushFixCommit(
    pr: PrData,
    patchedFiles: PatchedFile[],
    pushTo: string,
    branch: string,
    token: string,
): Promise<{ branch: string; url: string; files: string[] }> {
    const api = async (path: string, init?: RequestInit) => {
        const response = await githubFetch(path, token, init);
        const body = response.ok
            ? await response.json().catch(() => ({}))
            : ({} as Record<string, unknown>);
        return { response, body };
    };

    // 1. Resolve the push target's default branch head.
    const targetBase = await api(`/repos/${pushTo}`);
    if (!targetBase.response.ok)
        throw new Error(
            `push target ${pushTo} is not reachable with this token`,
        );
    const defaultBranch = String(targetBase.body.default_branch ?? "main");
    const baseRef = await api(
        `/repos/${pushTo}/git/ref/heads/${defaultBranch}`,
    );
    if (!baseRef.response.ok)
        throw new Error(`cannot resolve ${pushTo}:${defaultBranch}`);
    const baseSha = String(
        (baseRef.body.object as Record<string, unknown> | undefined)?.sha ?? "",
    );
    if (!baseSha) throw new Error(`cannot resolve ${pushTo}:${defaultBranch}`);

    // 2. Create the fix branch (idempotent when it already exists).
    const shortBranch = branch.startsWith("refs/heads/")
        ? branch.slice("refs/heads/".length)
        : branch;
    const refExists = await api(
        `/repos/${pushTo}/git/ref/heads/${shortBranch}`,
    );
    if (!refExists.response.ok) {
        const created = await api(`/repos/${pushTo}/git/refs`, {
            method: "POST",
            body: JSON.stringify({
                ref: `refs/heads/${shortBranch}`,
                sha: baseSha,
            }),
        });
        if (!created.response.ok)
            throw new Error(
                `branch creation failed (${created.response.status})`,
            );
    }

    // 3. Fast-forward the branch to the PR state (same fork network).
    let branchHead = baseSha;
    // `owner:branch` resolves a fork's head; a same-repository head is
    // addressed by its plain branch name.
    const headRef =
        pr.headRepo === pushTo.split("/")[1] &&
        pr.headOwner === pushTo.split("/")[0]
            ? pr.headBranch
            : `${pr.headOwner}:${pr.headBranch}`;
    const merged = await api(`/repos/${pushTo}/merges`, {
        method: "POST",
        body: JSON.stringify({
            base: shortBranch,
            head: headRef,
        }),
    });
    if (merged.response.ok) {
        branchHead = String(merged.body.sha ?? branchHead);
        if (merged.response.status === 204) {
            // 204 = base already contains head; the sha is not in the body.
            const current = await api(
                `/repos/${pushTo}/git/ref/heads/${shortBranch}`,
            );
            branchHead = String(
                (current.body.object as Record<string, unknown> | undefined)
                    ?.sha ?? branchHead,
            );
        }
    } else if (merged.response.status !== 409) {
        // 409 = nothing to merge; anything else blocks the ready diff.
        throw new Error(
            `merging the PR into ${shortBranch} failed (${merged.response.status})`,
        );
    }

    // 4. One commit with every patched file on top.
    const baseTree = await api(`/repos/${pushTo}/git/commits/${branchHead}`);
    const treeSha = String(
        (baseTree.body.tree as Record<string, unknown> | undefined)?.sha ?? "",
    );
    if (!treeSha) throw new Error("cannot resolve the branch tree");
    const tree = await api(`/repos/${pushTo}/git/trees`, {
        method: "POST",
        body: JSON.stringify({
            base_tree: treeSha,
            tree: patchedFiles.map((f) => ({
                path: f.path,
                mode: "100644",
                type: "blob",
                content: f.content,
            })),
        }),
    });
    if (!tree.response.ok)
        throw new Error(`tree creation failed (${tree.response.status})`);
    const commit = await api(`/repos/${pushTo}/git/commits`, {
        method: "POST",
        body: JSON.stringify({
            message: `fix: address review findings for PR #${pr.htmlUrl.split("/").pop()}\n\nProposed by the PullFix Pollinations agent.`,
            tree: String(tree.body.sha ?? ""),
            parents: [branchHead],
        }),
    });
    if (!commit.response.ok)
        throw new Error(`commit creation failed (${commit.response.status})`);
    const updated = await api(
        `/repos/${pushTo}/git/refs/heads/${shortBranch}`,
        {
            method: "PATCH",
            body: JSON.stringify({
                sha: String(commit.body.sha ?? ""),
                force: false,
            }),
        },
    );
    if (!updated.response.ok)
        throw new Error(`branch update failed (${updated.response.status})`);

    return {
        branch: shortBranch,
        url: `https://github.com/${pushTo}/tree/${shortBranch}`,
        files: patchedFiles.map((f) => f.path),
    };
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

function chatCompletionsResponse(
    model: string,
    content: string,
    usage: { inputTokens: number; outputTokens: number },
): Response {
    return Response.json({
        id: `pullfix-${crypto.randomUUID()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [
            {
                index: 0,
                message: { role: "assistant", content },
                finish_reason: "stop",
            },
        ],
        usage: {
            prompt_tokens: usage.inputTokens,
            completion_tokens: usage.outputTokens,
            total_tokens: usage.inputTokens + usage.outputTokens,
        },
    });
}

function responsesObjectResponse(
    model: string,
    content: string,
    usage: { inputTokens: number; outputTokens: number },
): Response {
    return Response.json({
        id: `pullfix-${crypto.randomUUID()}`,
        object: "response",
        created_at: Math.floor(Date.now() / 1000),
        model,
        status: "completed",
        output: [
            {
                type: "message",
                role: "assistant",
                status: "completed",
                content: [{ type: "output_text", text: content }],
            },
        ],
        usage: {
            input_tokens: usage.inputTokens,
            input_tokens_details: { cached_tokens: 0 },
            output_tokens: usage.outputTokens,
            total_tokens: usage.inputTokens + usage.outputTokens,
        },
    });
}

/** A patched file is only pushed when it fixes a finding in that same file. */
export function patchedFilesOk(
    patched: PatchedFile[],
    review: ReviewResult,
): boolean {
    if (!patched.length) return false;
    const findingFiles = new Set(review.findings.map((f) => f.file));
    return patched.every((f) => findingFiles.has(f.path));
}

export default async function agent({
    request,
    model,
    respond,
}: AgentContext): Promise<Response> {
    const body = (await request.json().catch(() => ({}))) as Record<
        string,
        unknown
    >;
    const input = parseAgentInput(lastUserText(body));
    const replyModel = input.model ?? REVIEW_MODEL;

    const fail = (message: string) => {
        const content = `PullFix could not review: ${message}`;
        return Array.isArray(body.messages)
            ? chatCompletionsResponse(replyModel, content, {
                  inputTokens: 0,
                  outputTokens: 0,
              })
            : responsesObjectResponse(replyModel, content, {
                  inputTokens: 0,
                  outputTokens: 0,
              });
    };

    if (!input.pr)
        return fail(
            "no PR link found. Send a GitHub pull request URL, optionally as JSON with push_to / github_token.",
        );

    let pr: PrData;
    try {
        pr = await fetchPullRequest(input.pr);
    } catch (error) {
        return fail(String((error as Error).message ?? error));
    }

    const reviewable = pr.files.slice(0, MAX_FILES);
    const contexts: Array<{ file: PrFile; context: string | null }> = [];
    for (const file of reviewable) {
        const fullText = await fetchFileContext(pr, file);
        contexts.push({
            file,
            context:
                fullText === null
                    ? null
                    : selectContext(fullText, file.patch ?? ""),
        });
    }
    const skipped = pr.files.length - reviewable.length;
    const prompt =
        buildReviewPrompt(pr, contexts) +
        (skipped > 0
            ? `\n\n(${skipped} further changed file(s) omitted for size; the review covers the files above.)`
            : "");

    const modelResponse = await respond({
        model: model(replyModel),
        instructions: REVIEW_INSTRUCTIONS,
        input: prompt,
        max_output_tokens: MAX_OUTPUT_TOKENS,
    });
    const modelJson = (await modelResponse.json()) as Record<string, unknown>;
    const usage = usageOf(modelJson);
    const cost = estimatedCost(usage);

    let review: ReviewResult;
    try {
        review = parseModelReview(outputTextOf(modelJson));
    } catch {
        return fail(
            "the review model returned unparseable output; retry the request.",
        );
    }

    let pushed: PushInfo | undefined;
    const patchable = review.patched_files.filter((f) =>
        pr.files.some((changed) => changed.filename === f.path),
    );
    if (!patchedFilesOk(patchable, review)) {
        pushed = {
            skipped:
                review.verdict === "clean"
                    ? "the change looks clean."
                    : "findings are not mechanical to fix, so the review stands on its own.",
        };
    } else if (!input.githubToken) {
        pushed = { skipped: "no github_token was provided with the request." };
    } else {
        const pushTo = input.pushTo ?? `${pr.baseOwner}/${pr.baseRepo}`;
        const branch = input.pushBranch ?? pushBranchName(input.pr.number);
        try {
            pushed = await pushFixCommit(
                pr,
                patchable,
                pushTo,
                branch,
                input.githubToken,
            );
        } catch (error) {
            pushed = { skipped: `push failed: ${(error as Error).message}` };
        }
    }

    const markdown = reviewToMarkdown(review, {
        model: replyModel,
        cost,
        usage,
        pushed,
    });
    return Array.isArray(body.messages)
        ? chatCompletionsResponse(replyModel, markdown, usage)
        : responsesObjectResponse(replyModel, markdown, usage);
}
