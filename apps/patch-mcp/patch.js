/**
 * Unified diff and patch application for text.
 *
 * Coding agents constantly need to hand another agent, a human reviewer or a
 * pull request robot a change to a file. Today they either rewrite the whole
 * file or describe the edit in prose. This server gives them the two
 * operations a patch has: produce one, apply one.
 *
 * Myers' algorithm, no dependencies, no upstream calls.
 */

/** Split into lines, keeping a trailing newline out of the last element. */
export function splitLines(text) {
    if (text === "") return [];
    const lines = text.split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    return lines;
}

/**
 * Myers greedy diff. Returns edit operations in reading order.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {{type: "eq"|"del"|"ins", line: string}[]}
 */
export function diffLines(a, b) {
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start]) {
        start += 1;
    }

    let endA = a.length;
    let endB = b.length;
    while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
        endA -= 1;
        endB -= 1;
    }

    const midA = a.slice(start, endA);
    const midB = b.slice(start, endB);

    const ops = [];
    for (let i = 0; i < start; i += 1) {
        ops.push({ type: "eq", line: a[i] });
    }
    ops.push(...myers(midA, midB));
    for (let i = endA; i < a.length; i += 1) {
        ops.push({ type: "eq", line: a[i] });
    }
    return ops;
}

function myers(a, b) {
    const n = a.length;
    const m = b.length;
    if (n === 0 && m === 0) return [];
    if (n === 0) return b.map((line) => ({ type: "ins", line }));
    if (m === 0) return a.map((line) => ({ type: "del", line }));

    const max = n + m;
    const v = new Map([[1, 0]]);
    const trace = [];

    for (let d = 0; d <= max; d += 1) {
        trace.push(new Map(v));
        for (let k = -d; k <= d; k += 2) {
            const down = k === -d || (k !== d && get(v, k - 1) < get(v, k + 1));
            let x = down ? get(v, k + 1) : get(v, k - 1) + 1;
            let y = x - k;
            while (x < n && y < m && a[x] === b[y]) {
                x += 1;
                y += 1;
            }
            v.set(k, x);
            if (x >= n && y >= m) return backtrack(trace, a, b);
        }
    }
    return [];
}

function get(map, key) {
    return map.has(key) ? map.get(key) : Number.NEGATIVE_INFINITY;
}

function backtrack(trace, a, b) {
    let x = a.length;
    let y = b.length;
    const ops = [];

    for (let d = trace.length - 1; d >= 0; d -= 1) {
        const v = trace[d];
        const k = x - y;
        const down = k === -d || (k !== d && get(v, k - 1) < get(v, k + 1));
        const prevK = down ? k + 1 : k - 1;
        const prevX = get(v, prevK);
        const prevY = prevX - prevK;

        while (x > prevX && y > prevY) {
            ops.push({ type: "eq", line: a[x - 1] });
            x -= 1;
            y -= 1;
        }
        if (d > 0) {
            if (x === prevX) {
                ops.push({ type: "ins", line: b[prevY] });
            } else {
                ops.push({ type: "del", line: a[prevX] });
            }
        }
        x = prevX;
        y = prevY;
    }

    return ops.reverse();
}

/**
 * Format operations as a unified diff.
 * @param {{type: string, line: string}[]} ops
 * @param {{context?: number, path?: string}} options
 */
export function formatUnified(ops, { context = 3, path = "text" } = {}) {
    const out = [`--- a/${path}`, `+++ b/${path}`];

    const changes = [];
    for (let index = 0; index < ops.length; index += 1) {
        if (ops[index].type !== "eq") changes.push(index);
    }
    if (changes.length === 0) return "";

    // Merge changes that are within 2 * context equal lines of each other.
    const groups = [];
    let groupStart = changes[0];
    let groupEnd = changes[0];
    for (const index of changes) {
        if (index - groupEnd <= context * 2) {
            groupEnd = index;
        } else {
            groups.push([groupStart, groupEnd]);
            groupStart = index;
            groupEnd = index;
        }
    }
    groups.push([groupStart, groupEnd]);

    let oldLine = 1;
    let newLine = 1;
    let cursor = 0;

    for (const [first, last] of groups) {
        const from = Math.max(0, first - context);
        const to = Math.min(ops.length - 1, last + context);

        for (; cursor < from; cursor += 1) {
            if (ops[cursor].type === "eq") {
                oldLine += 1;
                newLine += 1;
            } else if (ops[cursor].type === "del") {
                oldLine += 1;
            } else {
                newLine += 1;
            }
        }

        const body = ops.slice(from, to + 1);
        const oldCount = body.filter((op) => op.type !== "ins").length;
        const newCount = body.filter((op) => op.type !== "del").length;
        const oldStart = oldCount === 0 ? oldLine - 1 : oldLine;
        const newStart = newCount === 0 ? newLine - 1 : newLine;

        out.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
        for (const op of body) {
            const prefix =
                op.type === "eq" ? " " : op.type === "del" ? "-" : "+";
            out.push(prefix + op.line);
        }

        oldLine += oldCount;
        newLine += newCount;
        cursor = to + 1;
    }

    return out.join("\n");
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Parse a unified diff into hunks.
 * @returns {{oldStart: number, oldCount: number, newStart: number, newCount: number, lines: string[]}[]}
 */
export function parsePatch(patch) {
    const lines = patch.split("\n");
    const hunks = [];
    let current = null;

    for (const line of lines) {
        const match = HUNK_HEADER.exec(line);
        if (match) {
            current = {
                oldStart: Number(match[1]),
                oldCount: match[2] === undefined ? 1 : Number(match[2]),
                newStart: Number(match[3]),
                newCount: match[4] === undefined ? 1 : Number(match[4]),
                lines: [],
            };
            hunks.push(current);
            continue;
        }
        if (!current) continue; // file headers, index lines, prose
        if (line.startsWith("---") || line.startsWith("+++")) continue;
        if (line === "") continue;
        const marker = line[0];
        if (marker !== " " && marker !== "-" && marker !== "+") {
            throw new PatchError(
                `Unrecognized patch line: ${JSON.stringify(line.slice(0, 40))}`,
            );
        }
        current.lines.push(line);
    }

    if (hunks.length === 0) {
        throw new PatchError(
            "No hunks found. A patch needs at least one @@ header.",
        );
    }
    return hunks;
}

export class PatchError extends Error {}

function oldSide(hunk) {
    return hunk.lines
        .filter((line) => line[0] === " " || line[0] === "-")
        .map((line) => line.slice(1));
}

function newSide(hunk) {
    return hunk.lines
        .filter((line) => line[0] === " " || line[0] === "+")
        .map((line) => line.slice(1));
}

/**
 * Apply a unified diff to text.
 * @param {{text: string, patch: string, searchLines?: number, dryRun?: boolean}} input
 */
export function applyPatch({ text, patch, searchLines = 200, dryRun = false }) {
    const hadTrailingNewline = text.endsWith("\n");
    const lines = splitLines(text);
    const hunks = parsePatch(patch);
    let drift = 0;

    for (const hunk of hunks) {
        const expected = oldSide(hunk);
        const replacement = newSide(hunk);
        const anchor = Math.max(0, hunk.oldStart - 1 + drift);

        const at = findBlock(lines, expected, anchor, searchLines);
        if (at === -1) {
            const nearby = lines.slice(
                anchor,
                anchor + Math.max(expected.length, 3),
            );
            throw new PatchError(
                `Hunk @@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@ does not match. ` +
                    `Expected:\n${
                        expected
                            .slice(0, 6)
                            .map((line) => `  ${line}`)
                            .join("\n") || "  (nothing)"
                    }\n` +
                    `Found at line ${anchor + 1}:\n${
                        nearby
                            .slice(0, 6)
                            .map((line) => `  ${line}`)
                            .join("\n") || "  (end of text)"
                    }`,
            );
        }

        lines.splice(at, expected.length, ...replacement);
        drift += replacement.length - expected.length + (at - anchor);
    }

    if (dryRun) {
        return { applied: false, dryRun: true, hunks: hunks.length, text };
    }
    return {
        applied: true,
        dryRun: false,
        hunks: hunks.length,
        text: lines.join("\n") + (hadTrailingNewline ? "\n" : ""),
    };
}

function findBlock(lines, block, anchor, searchLines) {
    if (block.length === 0) return Math.min(anchor, lines.length);
    const matches = (at) => {
        if (at < 0 || at + block.length > lines.length) return false;
        for (let index = 0; index < block.length; index += 1) {
            if (lines[at + index] !== block[index]) return false;
        }
        return true;
    };

    if (matches(anchor)) return anchor;

    const limit = Math.max(anchor, lines.length - block.length);
    for (let offset = 1; offset <= searchLines; offset += 1) {
        for (const at of [anchor - offset, anchor + offset]) {
            if (at < 0 || at > limit) continue;
            if (matches(at)) return at;
        }
    }
    return -1;
}
