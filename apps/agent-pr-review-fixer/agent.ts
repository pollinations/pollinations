/**
 * pr-review-fixer — a code agent that reviews a pull request and produces the
 * commit that fixes its most important finding.
 *
 * Input:  the PR URL (or `owner/repo#N`) anywhere in the request text.
 * Output: a Responses object whose text answer is a JSON block with review
 *         findings, a unified-diff fix patch, the exact non-force push
 *         commands, and the automation boundaries.
 *
 * Design notes:
 * - GitHub's REST API is called unauthenticated: public PRs need no token, so
 *   the agent never holds a secret it could leak or misuse.
 * - The review itself runs through respond(): the gateway owns the model
 *   loop, billing and usage. The agent returns that response directly, so the
 *   billed usage is always valid.
 * - The agent is deterministic about the risky part: it fetches the PR,
 *   resolves the head branch, and generates the exact git commands (clone →
 *   fetch PR head → apply → commit → push WITHOUT force, only the reviewed
 *   PR's head branch). Those commands are injected into the prompt verbatim
 *   so the model echoes them unchanged — the model never invents push flags.
 */

type AgentContext = {
    request: Request;
    model: (id: string) => unknown;
    respond: (settings: {
        model: unknown;
        instructions: string;
        prompt: string;
    }) => Promise<Response>;
};

export type PrRef = { owner: string; repo: string; number: number };

const PREFERRED_MODEL = "openai/gpt-5.4-nano";
/** Diffs beyond this are truncated: reviews stay focused and costs bounded. */
const MAX_DIFF_CHARS = 120_000;

/**
 * Pull the PR reference out of the request text. Accepts a full
 * `https://github.com/owner/repo/pull/123` URL or the `owner/repo#123`
 * shorthand. Exported for tests.
 */
export function parsePrRef(text: string): PrRef | null {
    const url = text.match(/github\.com[/:]([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/i);
    if (url) return { owner: url[1], repo: url[2], number: Number(url[3]) };
    const shorthand = text.match(/\b([\w.-]+\/[\w.-]+)#(\d+)\b/);
    if (shorthand) {
        const [owner, repo] = shorthand[1].split("/");
        return { owner, repo, number: Number(shorthand[2]) };
    }
    return null;
}

/**
 * Extract the last user message from either a Responses (`input`) or a Chat
 * Completions (`messages`) gateway body. Exported for tests.
 */
export function inputTextOf(body: unknown): string {
    if (!body || typeof body !== "object") return "";
    const record = body as Record<string, unknown>;
    if (typeof record.input === "string") return record.input;
    if (Array.isArray(record.input)) return partsText(record.input);
    if (Array.isArray(record.messages)) {
        for (let i = record.messages.length - 1; i >= 0; i--) {
            const message = record.messages[i] as Record<string, unknown>;
            if (message?.role === "user") return partsText([message.content]);
        }
    }
    return "";
}

function partsText(value: unknown): string {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map(partsText).join(" ");
    if (value && typeof value === "object") {
        const part = value as Record<string, unknown>;
        return [part.text, part.input_text]
            .filter((t) => typeof t === "string")
            .join(" ");
    }
    return "";
}

export function capDiff(diff: string): { text: string; truncated: boolean } {
    if (diff.length <= MAX_DIFF_CHARS) return { text: diff, truncated: false };
    return { text: diff.slice(0, MAX_DIFF_CHARS), truncated: true };
}

/**
 * Extract the head branch name from a PR page's embedded JSON. Fallback for
 * when the REST API is rate-limited. Exported for tests.
 */
export function parseHeadRef(html: string): string | null {
    const match = html.match(/"headRefName":"([^"]+)"/);
    return match ? match[1] : null;
}

/**
 * The exact operator commands: check out the PR head, apply the patch,
 * commit, and push WITHOUT force — only the reviewed PR's head branch is
 * ever written. Exported for tests.
 */
export function fixCommands(
    ref: PrRef,
    headRef: string,
    message: string,
): string[] {
    const subject = message.replace(/[\r\n]+/g, " ").slice(0, 72);
    return [
        `git clone https://github.com/${ref.owner}/${ref.repo}.git && cd ${ref.repo}`,
        `git fetch origin pull/${ref.number}/head:pr-${ref.number} && git checkout pr-${ref.number}`,
        "git apply fix.patch",
        `git commit -am "${subject.replaceAll('"', '\\"')}"`,
        `git push origin HEAD:${headRef}`,
    ];
}

/** What this agent deliberately refuses to do. Returned in every answer. */
export const BOUNDARIES = [
    "Never merges a PR: merging stays a human or maintainer action.",
    "Never force-pushes; the push writes only to the reviewed PR's head branch, as a fast-forward.",
    "Holds no GitHub credentials; the operator runs the push commands with their own credentials.",
    "Never writes outside the reviewed PR branch.",
];

async function githubJson(path: string): Promise<Response> {
    const response = await fetch(`https://api.github.com${path}`, {
        headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "pollinations-pr-review-fixer",
        },
    });
    if (!response.ok) {
        throw new Error(`GitHub ${path} failed: ${response.status}`);
    }
    return response;
}

type PrMeta = {
    html_url?: string;
    title?: string;
    state?: string;
    draft?: boolean;
    user?: { login?: string };
    head?: { ref?: string; sha?: string };
};

/**
 * Fetch PR metadata and the full unified diff. The diff comes from
 * github.com's pull/N.diff endpoint (served outside the API rate limit);
 * metadata prefers the REST API and degrades to the PR page's embedded
 * headRefName when the API throttles shared hosting IPs.
 */
export async function fetchPullRequest(ref: PrRef): Promise<{
    meta: PrMeta;
    diff: { text: string; truncated: boolean };
}> {
    const diffResponse = await fetch(
        `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}.diff`,
        { headers: { "User-Agent": "pollinations-pr-review-fixer" } },
    );
    if (!diffResponse.ok) {
        throw new Error(
            `GitHub diff for PR #${ref.number} failed: ${diffResponse.status}`,
        );
    }
    const fullDiff = await diffResponse.text();

    let meta: PrMeta = {};
    try {
        meta = (await (
            await githubJson(
                `/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`,
            )
        ).json()) as PrMeta;
    } catch {
        // API throttled: recover the head branch from the PR page.
        try {
            const page = await fetch(
                `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}`,
                { headers: { "User-Agent": "pollinations-pr-review-fixer" } },
            );
            if (page.ok) {
                const html = await page.text();
                const headRef = parseHeadRef(html);
                meta = {
                    html_url: `https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}`,
                    head: headRef ? { ref: headRef } : undefined,
                };
            }
        } catch {
            /* head ref stays unresolved; commands use a placeholder below */
        }
    }
    return { meta, diff: capDiff(fullDiff) };
}

const SYSTEM = `You are a meticulous pull-request reviewer. You are given a GitHub pull request diff and, from the operator, the exact git commands that will deliver the fix. Review the diff and answer with ONE fenced json block and nothing else.

Rules:
- Findings: real defects only — bugs, security holes, correctness regressions, broken contracts. No style opinions. Order by severity (critical, major, minor); each has severity, file, title, detail.
- Fix: exactly ONE finding — the most important fixable one — with a minimal unified diff that applies cleanly with \`git apply\` against the PR head. Accurate hunk headers; do not touch unrelated lines; add no dependencies, secrets, or merge/force-push behaviour. Include a \`verify\` command that proves the fix (e.g. a focused test).
- Echo the operator-provided \`commands\` array and \`boundaries\` array VERBATIM. Never invent, reorder, or add git commands, and never add --force.

Output shape, exactly:
{"summary":"string","findings":[{"severity":"critical|major|minor","file":"path","title":"string","detail":"string"}],"fix":{"finding":"title of the finding being fixed","patch":"unified diff text","verify":"shell command"},"commands":["the verbatim operator commands"],"boundaries":["the verbatim boundaries"]}`;

/**
 * Build the review prompt. Injects the diff, the PR head branch and the
 * exact deterministic commands so the model echoes them unchanged.
 * Exported for tests.
 */
export function buildReviewPrompt(
    ref: PrRef,
    diff: { text: string; truncated: boolean },
    headRef: string,
    commands: string[],
): string {
    return [
        `Review this GitHub pull request: https://github.com/${ref.owner}/${ref.repo}/pull/${ref.number}`,
        `PR head branch: ${headRef}`,
        diff.truncated
            ? "NOTE: the diff was truncated; review what is present and flag the truncation in the summary."
            : "",
        "",
        'OPERATOR-COMMANDS (echo this exact array as "commands"):',
        JSON.stringify(commands, null, 2),
        "",
        'BOUNDARIES (echo this exact array as "boundaries"):',
        JSON.stringify(BOUNDARIES, null, 2),
        "",
        "UNIFIED DIFF:",
        diff.text,
    ]
        .filter((line) => line !== "")
        .join("\n");
}

export default async function agent({ request, model, respond }: AgentContext) {
    // Read the PR URL from a clone: respond() re-reads the original request
    // body, and in the worker runtime the two share the underlying stream.
    let text = "";
    try {
        text = inputTextOf(await request.clone().json());
    } catch {
        /* body unreadable; handled below */
    }

    const ref = parsePrRef(text);
    if (!ref) {
        return Response.json(
            {
                ok: false,
                error: "Include a pull request to review, e.g. `Review https://github.com/owner/repo/pull/123 and fix the top finding`.",
            },
            { status: 400 },
        );
    }

    try {
        const { meta, diff } = await fetchPullRequest(ref);
        // Never guess the base branch when the head ref is unknown — a wrong
        // push target is the one destructive outcome this agent must avoid.
        const headRef = meta.head?.ref ?? "PR_HEAD_BRANCH";
        const commands = fixCommands(
            ref,
            headRef,
            `fix: top review finding in PR #${ref.number}`,
        );
        // The diff, head branch and exact commands ride in `instructions`
        // (the system turn); the caller's request stays the user turn.
        const instructions = `${SYSTEM}\n\n${buildReviewPrompt(
            ref,
            diff,
            headRef,
            commands,
        )}`;
        // respond() replays the caller's request through the model and owns
        // billing/usage; return its response verbatim. No model fallback:
        // respond() consumes the request body, so it can run only once.
        return await respond({
            model: model(PREFERRED_MODEL),
            instructions,
        });
    } catch (error) {
        return Response.json(
            {
                ok: false,
                error: error instanceof Error ? error.message : String(error),
            },
            { status: 502 },
        );
    }
}
