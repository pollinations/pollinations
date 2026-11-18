import { execFileSync } from "node:child_process";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

// Run with --apply after production accepts the new label.
const repository = "repos/pollinations/pollinations";
const oldName = "POLLEN-QUEST";
const newName = "QUEST";
const labelId = 10903305702;

function github(...args) {
    return JSON.parse(
        execFileSync("gh", ["api", ...args], { encoding: "utf8" }),
    );
}

function assignments(name) {
    const numbers = execFileSync(
        "gh",
        [
            "api",
            `${repository}/issues?state=all&labels=${name}&per_page=100`,
            "--paginate",
            "--jq",
            ".[].number",
        ],
        { encoding: "utf8" },
    );
    // The repository issues endpoint includes pull requests.
    return new Set(numbers.split(/\s+/).filter(Boolean));
}

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--apply")) {
    throw new Error("Usage: node backfill-quest-label.mjs [--apply]");
}

const labels = github(
    `${repository}/labels?per_page=100`,
    "--paginate",
    "--slurp",
).flat();
const existing = labels.find((label) => label.id === labelId);
if (
    !existing ||
    ![oldName, newName].includes(existing.name) ||
    labels.some((label) => label.name === newName && label.id !== labelId)
) {
    throw new Error("Unexpected quest label identity or name.");
}

const gitDir = execFileSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { encoding: "utf8" },
).trim();
const snapshot = join(gitDir, `pollinations-quest-label-${labelId}.json`);
let before;
if (existing.name === oldName) {
    before = assignments(oldName);
    if (before.size === 0)
        throw new Error("The original label has no assignments.");
    console.log(
        `Rename label ${labelId} to ${newName} in place for ${before.size} items.`,
    );
    if (args.length === 0) {
        console.log(
            "Dry run. Use --apply after verifying production compatibility.",
        );
        process.exit(0);
    }

    // Keep the pre-rename list across retries and worktrees.
    const temp = `${snapshot}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify([...before]));
    renameSync(temp, snapshot);
    console.log(`Saved original assignments to ${snapshot}.`);
    const renamed = github(
        "--method",
        "PATCH",
        `${repository}/labels/${oldName}`,
        "-f",
        `new_name=${newName}`,
        "-f",
        "description=Community quest maintained by Pollinations",
    );
    if (renamed.id !== labelId || renamed.name !== newName) {
        throw new Error(
            "GitHub returned an unexpected label after the rename.",
        );
    }
} else {
    // Without the original list a renamed label alone proves nothing.
    const saved = JSON.parse(readFileSync(snapshot, "utf8"));
    if (
        !Array.isArray(saved) ||
        !saved.length ||
        !saved.every((n) => typeof n === "string" && /^[1-9]\d*$/.test(n))
    ) {
        throw new Error(`Invalid assignment snapshot: ${snapshot}`);
    }
    before = new Set(saved);
}

let missing = [...before];
for (let attempt = 0; attempt < 10; attempt++) {
    const after = assignments(newName);
    missing = [...before].filter((number) => !after.has(number));
    if (missing.length === 0) break;
    await setTimeout(2000);
}
if (missing.length > 0) {
    throw new Error(
        `Label renamed, but assignments are unverified: ${missing.join(", ")}`,
    );
}
console.log(
    `Verified all ${before.size} original assignments under ${newName}.`,
);
