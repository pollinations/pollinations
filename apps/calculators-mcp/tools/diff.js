import { z } from "zod";

// A line is carried as a { text, newline } pair rather than bare text, so "a" and "a\n"
// are different lines: the text matches but the terminator does not, which GNU diff
// reports as a replacement. Keeping the terminator on the line itself is also what lets
// the no-newline marker be printed directly after the line it describes, instead of being
// guessed once at the end of the whole diff.
function splitLines(text) {
    if (text === "") return [];
    const raw = text.split("\n");
    const endsWithNewline = raw[raw.length - 1] === "";
    if (endsWithNewline) raw.pop();
    return raw.map((line, index) => ({
        text: line,
        // Only the final line can be missing its terminator.
        newline: !(index === raw.length - 1 && !endsWithNewline),
    }));
}

function sameLine(a, b) {
    return a.text === b.text && a.newline === b.newline;
}

// Longest common subsequence over lines, as a flat Uint32Array table. It is O(n*m)
// entries, which the 2000-line cap keeps at 4M cells, and it gives the true minimal
// edit script rather than a greedy line-by-line comparison.
function lcsTable(a, b) {
    const width = b.length + 1;
    const table = new Uint32Array((a.length + 1) * width);
    for (let i = a.length - 1; i >= 0; i -= 1) {
        for (let j = b.length - 1; j >= 0; j -= 1) {
            table[i * width + j] = sameLine(a[i], b[j])
                ? table[(i + 1) * width + j + 1] + 1
                : Math.max(
                      table[(i + 1) * width + j],
                      table[i * width + j + 1],
                  );
        }
    }
    return { table, width };
}

function editScript(a, b) {
    const { table, width } = lcsTable(a, b);
    const ops = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
        if (sameLine(a[i], b[j])) {
            ops.push({ type: "equal", line: a[i] });
            i += 1;
            j += 1;
        } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
            ops.push({ type: "delete", line: a[i] });
            i += 1;
        } else {
            ops.push({ type: "insert", line: b[j] });
            j += 1;
        }
    }
    for (; i < a.length; i += 1) ops.push({ type: "delete", line: a[i] });
    for (; j < b.length; j += 1) ops.push({ type: "insert", line: b[j] });
    return ops;
}

// Merge each run of changes into a hunk that keeps `context` unchanged lines either side,
// joining hunks whose context would overlap.
function hunkRanges(ops, context) {
    const changed = [];
    for (let index = 0; index < ops.length; index += 1)
        if (ops[index].type !== "equal") changed.push(index);
    if (changed.length === 0) return [];

    const ranges = [];
    let start = Math.max(0, changed[0] - context);
    let end = Math.min(ops.length - 1, changed[0] + context);
    for (const index of changed.slice(1)) {
        if (index - context <= end + 1) {
            end = Math.min(ops.length - 1, index + context);
        } else {
            ranges.push([start, end]);
            start = Math.max(0, index - context);
            end = Math.min(ops.length - 1, index + context);
        }
    }
    ranges.push([start, end]);
    return ranges;
}

function toUnified(before, after, context) {
    const ops = editScript(before, after);
    const ranges = hunkRanges(ops, context);
    if (ranges.length === 0) return { diff: "", added: 0, removed: 0 };

    // Unified diff line numbers are 1-based and count only lines present on that side,
    // so one forward pass over the whole stream gives the start of every range.
    const oldLineNo = new Array(ops.length);
    const newLineNo = new Array(ops.length);
    let lineA = 0;
    let lineB = 0;
    for (let index = 0; index < ops.length; index += 1) {
        oldLineNo[index] = lineA;
        newLineNo[index] = lineB;
        if (ops[index].type !== "insert") lineA += 1;
        if (ops[index].type !== "delete") lineB += 1;
    }

    const out = [];
    for (const [from, to] of ranges) {
        const slice = ops.slice(from, to + 1);
        const oldCount = slice.filter((op) => op.type !== "insert").length;
        const newCount = slice.filter((op) => op.type !== "delete").length;
        // An empty side of a hunk is numbered from the line before it, as diff(1) does.
        const oldStart = oldCount === 0 ? oldLineNo[from] : oldLineNo[from] + 1;
        const newStart = newCount === 0 ? newLineNo[from] : newLineNo[from] + 1;
        // diff(1) omits the count when it is 1: "@@ -1 +1 @@", not "@@ -1,1 +1,1 @@".
        // A zero-length side keeps its ",0" though.
        const range = (start, count) =>
            count === 1 ? `${start}` : `${start},${count}`;
        out.push(
            `@@ -${range(oldStart, oldCount)} +${range(newStart, newCount)} @@`,
        );
        for (const op of slice) {
            const prefix =
                op.type === "equal" ? " " : op.type === "delete" ? "-" : "+";
            out.push(prefix + op.line.text);
            // The marker belongs to the line it follows, exactly where GNU puts it.
            if (!op.line.newline) out.push("\\ No newline at end of file");
        }
    }

    return {
        diff: out.join("\n"),
        added: ops.filter((op) => op.type === "insert").length,
        removed: ops.filter((op) => op.type === "delete").length,
    };
}

export const diffTools = [
    [
        "diff_text",
        'Produce a unified diff between two texts, line by line, locally. Uses a longest-common-subsequence script, so the returned changes are minimal rather than a naive line-by-line comparison. A final line without a newline is reported the way diff(1) does, with a "\\ No newline at end of file" marker after that line, including when only the newline changed. Returns the diff body with @@ hunk headers plus the added and removed line counts; no network or model calls.',
        {
            before: z.string().max(200000).describe("Original text."),
            after: z.string().max(200000).describe("Updated text."),
            context: z
                .number()
                .int()
                .min(0)
                .max(20)
                .default(3)
                .describe(
                    "Unchanged lines to keep on each side of a change, 0–20.",
                ),
        },
        ({ before, after, context }) => {
            const a = splitLines(before);
            const b = splitLines(after);
            if (a.length > 2000 || b.length > 2000)
                throw new Error(
                    `too many lines: ${a.length} and ${b.length}, at most 2000 each.`,
                );
            return toUnified(a, b, context);
        },
    ],
];
