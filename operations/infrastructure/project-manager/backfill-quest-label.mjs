import { execFileSync } from "node:child_process";
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
if (existing?.name === newName) {
    console.log(`The original label already has the name ${newName}.`);
    process.exit(0);
}
if (
    existing?.name !== oldName ||
    labels.some((label) => label.name === newName)
) {
    throw new Error(
        "The source label changed or the target name is already taken.",
    );
}

const before = assignments(oldName);
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
    throw new Error("GitHub returned an unexpected label after the rename.");
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
