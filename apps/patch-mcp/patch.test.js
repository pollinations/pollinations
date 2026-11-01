import assert from "node:assert/strict";
import test from "node:test";
import { applyPatch, diffLines, formatUnified, splitLines } from "./patch.js";

function patchOf(before, after, options) {
    return formatUnified(
        diffLines(splitLines(before), splitLines(after)),
        options,
    );
}

test("identical texts produce no patch", () => {
    assert.equal(patchOf("a\nb\n", "a\nb\n"), "");
});

test("a single changed line keeps three lines of context", () => {
    const before = "one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\n";
    const after = "one\ntwo\nthree\nFOUR\nfive\nsix\nseven\neight\n";
    const patch = patchOf(before, after);
    assert.match(patch, /^--- a\/text\n\+\+\+ b\/text\n/);
    assert.match(patch, /^@@ -1,7 \+1,7 @@$/m);
    assert.match(patch, /^-four$/m);
    assert.match(patch, /^\+FOUR$/m);
    assert.equal(applyPatch({ text: before, patch }).text, after);
});

test("insertions and deletions round-trip", () => {
    const before = "alpha\nbeta\ngamma\n";
    const after = "alpha\nbeta\nbeta two\ngamma\ndelta\n";
    const patch = patchOf(before, after);
    assert.equal(applyPatch({ text: before, patch }).text, after);
});

test("hunks close together merge, far apart split", () => {
    const before = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join(
        "\n",
    );
    const after = before
        .replace("line 3", "line three")
        .replace("line 5", "line five")
        .replace("line 35", "line thirty-five");
    const patch = patchOf(before, after);
    assert.equal((patch.match(/^@@ /gm) ?? []).length, 2);
    assert.equal(applyPatch({ text: before, patch }).text, after);
});

test("a patch survives surrounding lines moving", () => {
    const before = "keep\nsecond\nthird\n";
    const patch = patchOf(before, "keep\nsecond\nTHIRD\n");
    const moved = "new intro\nanother new line\nkeep\nsecond\nthird\n";
    const result = applyPatch({ text: moved, patch });
    assert.equal(
        result.text,
        "new intro\nanother new line\nkeep\nsecond\nTHIRD\n",
    );
    assert.equal(result.hunks, 1);
});

test("a mismatched hunk explains itself and changes nothing", () => {
    const patch = patchOf("a\nb\nc\n", "a\nB\nc\n");
    assert.throws(
        () =>
            applyPatch({
                text: "completely\ndifferent\n",
                patch,
                searchLines: 0,
            }),
        (error) => {
            assert.match(error.message, /does not match/);
            assert.match(error.message, /@@ -1,3 \+1,3 @@/);
            assert.match(error.message, /Expected:/);
            return true;
        },
    );
});

test("a trailing newline is preserved", () => {
    const withNewline = applyPatch({
        text: "a\nb\n",
        patch: patchOf("a\nb\n", "a\nB\n"),
    });
    assert.equal(withNewline.text, "a\nB\n");

    const withoutNewline = applyPatch({
        text: "a\nb",
        patch: patchOf("a\nb", "a\nB"),
    });
    assert.equal(withoutNewline.text, "a\nB");
});

test("dry run reports success without returning text", () => {
    const patch = patchOf("a\nb\n", "a\nb\nc\n");
    const result = applyPatch({ text: "a\nb\n", patch, dryRun: true });
    assert.equal(result.dryRun, true);
    assert.equal(result.text, "a\nb\n");
});

test("an empty patch is rejected", () => {
    assert.throws(
        () => applyPatch({ text: "a\n", patch: "not a patch" }),
        /No hunks/,
    );
});

test("a pure insertion at the top applies", () => {
    const patch = patchOf("first\nsecond\n", "header\nfirst\nsecond\n");
    assert.equal(
        applyPatch({ text: "first\nsecond\n", patch }).text,
        "header\nfirst\nsecond\n",
    );
});
