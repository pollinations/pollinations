#!/usr/bin/env node
import { spawnSync } from "node:child_process";
// review-fix.mjs — minimal helper for the pr-review-fix prompt agent.
// The agent prompt does the judging; this script only pins metadata,
// names branches, sanitizes logs, and accounts cost. No dependencies.
// Usage:
//   node scripts/review-fix.mjs pin --pr <url> --head <sha> --base <sha> --out <dir>
//   node scripts/review-fix.mjs cost --usage <usage.json> --pricing <pricing.json>
//   node scripts/review-fix.mjs sanitize --in <file> --out <file>
//   node scripts/review-fix.mjs push --remote <fork-url> --branch <fix/17245-...>
// (push is fork-only + branch-prefix guarded; ambient credential-helper auth)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const INVOKED_AS_CLI =
    process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

export const PR_URL_RE =
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/.*)?$/;

export function parsePrUrl(url) {
    const m = PR_URL_RE.exec(String(url).trim());
    if (!m) throw new Error(`not a GitHub PR URL: ${url}`);
    return { owner: m[1], repo: m[2], number: Number(m[3]) };
}

const SHA_RE = /^[0-9a-f]{40}$/;

export function assertSha(sha, label = "sha") {
    if (!SHA_RE.test(String(sha))) {
        throw new Error(`${label} must be a 40-char hex commit, got: ${sha}`);
    }
    return String(sha);
}

export function slugify(text) {
    return (
        String(text)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 40)
            .replace(/^-+|-+$/g, "") || "fix"
    );
}

export function fixBranchName(prNumber, slug) {
    if (!Number.isInteger(prNumber) || prNumber < 1) {
        throw new Error(`bad PR number: ${prNumber}`);
    }
    return `fix/17245-${prNumber}-${slugify(slug)}`;
}

const TOKEN_RES = [
    /sk-(?:proj|live)-[A-Za-z0-9_-]{8,}|sk_[A-Za-z0-9_-]{8,}/g,
    /gh[pousr]_[A-Za-z0-9_]{8,}/g,
    /github_pat_[A-Za-z0-9_]{8,}/g,
    /Bearer\s+[A-Za-z0-9._~+/-]+/gi,
    /[A-Za-z0-9_.-]*?(?:api[_-]?key|apitoken|auth[_-]?token|access[_-]?token|secret|passwd|password)\s*[:=]\s*\S+/gi,
    /-----BEGIN (?:PGP )?[A-Z ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?-----END (?:PGP )?[A-Z ]*PRIVATE KEY(?: BLOCK)?-----/g,
    /-----BEGIN (?:PGP )?[A-Z ]*PRIVATE KEY(?: BLOCK)?-----\n(?:[A-Za-z0-9+/=]{8,}.*\n?)+/g,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----(?:[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----)?/g,
    /:\/\/(?:[^/\s:@]+:)?[^/\s@]+@/g,
];

export function sanitize(text) {
    let out = String(text);
    for (const re of TOKEN_RES) out = out.replace(re, "***REDACTED***");
    return out;
}

// usage: {prompt_tokens, completion_tokens, cached_tokens?,
//   prompt_tokens_details?: {cached_tokens?}, cache_write_tokens?}
//   (OpenAI-style; a missing nested block falls back to top-level fields)
// pricing: {currency, promptTextTokens, promptCachedTokens?, completionTextTokens,
//   promptCacheWriteTokens?} (per-token rates, pollen).
// Null/empty rates or missing usage are reported as unknown, never
// zero-filled (totalEstimated goes null). Cache-write tokens are
// informational only (provider billing ambiguous): reported on their own
// line, excluded from the total.
export function costRecord(usage, pricing) {
    const lines = [];
    let total = 0;
    let unknown = false;
    const rate = (name, tokens, opts = {}) => {
        const raw = pricing[name];
        const r =
            raw === null || raw === undefined || raw === "" ? NaN : Number(raw);
        if (
            !Number.isFinite(r) ||
            tokens === null ||
            !Number.isFinite(tokens)
        ) {
            const shown = Number.isFinite(tokens) ? tokens : "unknown";
            lines.push({
                category: name,
                tokens: shown,
                cost: "unknown",
                ...(opts.informational
                    ? { billing: "ambiguous", excludedFromTotal: true }
                    : {}),
            });
            if (!opts.informational) unknown = true;
            return;
        }
        const cost = tokens * r;
        if (!opts.informational) total += cost;
        lines.push({
            category: name,
            tokens,
            rate: r,
            cost,
            ...(opts.informational
                ? { billing: "ambiguous", excludedFromTotal: true }
                : {}),
        });
    };
    const nested = usage.prompt_tokens_details?.cached_tokens;
    const ccRaw = nested ?? usage.cached_tokens;
    const ccBad =
        ccRaw !== null &&
        ccRaw !== undefined &&
        ccRaw !== "" &&
        !Number.isFinite(Number(ccRaw));
    const cc = ccBad
        ? NaN
        : ccRaw === null || ccRaw === undefined || ccRaw === ""
          ? 0
          : Number(ccRaw);
    const pt =
        usage.prompt_tokens === null ||
        usage.prompt_tokens === undefined ||
        usage.prompt_tokens === ""
            ? null
            : Number(usage.prompt_tokens);
    const ct =
        usage.completion_tokens === null ||
        usage.completion_tokens === undefined ||
        usage.completion_tokens === ""
            ? null
            : Number(usage.completion_tokens);
    const fresh =
        pt === null || ccBad
            ? null
            : Math.max(pt - (Number.isFinite(cc) ? cc : 0), 0);
    rate("promptTextTokens", fresh);
    if (cc > 0) rate("promptCachedTokens", cc);
    rate("completionTextTokens", ct);
    const cw =
        usage.cache_write_tokens === null ||
        usage.cache_write_tokens === undefined ||
        usage.cache_write_tokens === ""
            ? null
            : Number(usage.cache_write_tokens);
    if (cw !== null && cw > 0)
        rate("promptCacheWriteTokens", cw, { informational: true });
    return {
        currency: pricing.currency ?? "unknown",
        lines,
        totalEstimated: unknown ? null : total,
    };
}

// Push guard: pushes go ONLY to the caller's fork on a quest branch.
// Ambient auth (credential helper) only — tokens never travel in URLs/argv.
export const FORK_REMOTE_RE =
    /^https:\/\/github\.com\/patbing\/[A-Za-z0-9_.-]+?(?:\.git)?\/?$/i;
export const FORK_SSH_RE =
    /^git@github\.com:patbing\/[A-Za-z0-9_.-]+?(?:\.git)?$/i;
export const FIX_BRANCH_RE = /^fix\/17245-\d+-[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function guardPush(remoteUrl, branch) {
    const remote = String(remoteUrl);
    const br = String(branch);
    if (!FIX_BRANCH_RE.test(br)) {
        throw new Error(
            `refusing push: branch must match fix/17245-<pr>-<slug>, got: ${br}`,
        );
    }
    if (!FORK_REMOTE_RE.test(remote) && !FORK_SSH_RE.test(remote)) {
        throw new Error(
            `refusing push: remote must be the caller's fork like https://github.com/patbing/<repo>.git, got: ${remote}`,
        );
    }
    return { remote, branch: br };
}

function cmdPush(args) {
    const get = (k) => {
        const i = args.indexOf(k);
        if (i < 0 || !args[i + 1]) throw new Error(`missing ${k} value`);
        return args[i + 1];
    };
    const { remote, branch } = guardPush(get("--remote"), get("--branch"));
    // Human approval itself is operator-side (prompt-gated); the helper
    // enforces destination rules: refuse refs that already exist remotely
    // (ONLY NEW branches — no fast-forward updates).
    const baseEnv = {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
        GIT_ASKPASS: "",
    };
    const ls = spawnSync("git", ["ls-remote", remote, branch], {
        encoding: "utf8",
        timeout: 30000,
        env: baseEnv,
    });
    if (ls.status !== 0) {
        throw new Error(
            `ref check failed: ${sanitize(ls.stderr || "").slice(0, 200)}`,
        );
    }
    if (ls.stdout.trim() !== "") {
        throw new Error(
            `refusing push: remote branch already exists: ${branch}`,
        );
    }
    const r = spawnSync("git", ["push", remote, branch], {
        encoding: "utf8",
        timeout: 60000,
        env: baseEnv,
    });
    if (r.status !== 0) {
        throw new Error(
            `git push failed: ${sanitize(r.stderr || "").slice(0, 300)}`,
        );
    }
    console.log(`pushed ${branch}`);
}

function cmdPin(args) {
    const get = (k) => {
        const i = args.indexOf(k);
        if (i < 0 || !args[i + 1]) throw new Error(`missing ${k} value`);
        return args[i + 1];
    };
    const pr = parsePrUrl(get("--pr"));
    const head = assertSha(get("--head"), "head");
    const base = assertSha(get("--base"), "base");
    const out = get("--out");
    mkdirSync(out, { recursive: true });
    const record = {
        pr: `https://github.com/${pr.owner}/${pr.repo}/pull/${pr.number}`,
        owner: pr.owner,
        repo: pr.repo,
        number: pr.number,
        head,
        base,
        pinnedAt: new Date().toISOString(),
    };
    writeFileSync(
        join(out, "pin.json"),
        JSON.stringify(record, null, 2) + "\n",
    );
    console.log(JSON.stringify(record));
}

function cmdCost(args) {
    const get = (k) => {
        const i = args.indexOf(k);
        if (i < 0 || !args[i + 1]) throw new Error(`missing ${k} value`);
        return args[i + 1];
    };
    const usage = JSON.parse(readFileSync(get("--usage"), "utf8"));
    const pricing = JSON.parse(readFileSync(get("--pricing"), "utf8"));
    console.log(JSON.stringify(costRecord(usage, pricing), null, 2));
}

function cmdSanitize(args) {
    const get = (k) => {
        const i = args.indexOf(k);
        if (i < 0 || !args[i + 1]) throw new Error(`missing ${k} value`);
        return args[i + 1];
    };
    writeFileSync(get("--out"), sanitize(readFileSync(get("--in"), "utf8")));
    console.log("sanitized");
}

const [, , cmd, ...rest] = process.argv;
if (INVOKED_AS_CLI) {
    try {
        if (cmd === "pin") cmdPin(rest);
        else if (cmd === "cost") cmdCost(rest);
        else if (cmd === "sanitize") cmdSanitize(rest);
        else if (cmd === "push") cmdPush(rest);
        else
            throw new Error(
                "usage: review-fix.mjs <pin|cost|sanitize|push> ...",
            );
    } catch (err) {
        console.error(`review-fix: ${sanitize(err.message)}`);
        process.exit(1);
    }
}
