import { execFileSync } from "node:child_process";
import { readSourceInfo } from "./source-info";

if (
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.GITHUB_REF !== "refs/heads/production"
)
    throw new Error(
        "Deploy Flow through Deploy / Applications from production.",
    );

const source = await readSourceInfo();
if (source.dirty) throw new Error("Deploy Flow from a clean checkout.");
const vars = {
    FLOW_REVISION: source.revision,
    FLOW_MAIN_REVISION: source.mainRevision,
    FLOW_DIRTY: "false",
};
execFileSync(
    "wrangler",
    [
        "deploy",
        ...Object.entries(vars).flatMap(([name, value]) => [
            "--var",
            `${name}:${value}`,
        ]),
    ],
    { stdio: "inherit", env: { ...process.env, ...vars } },
);
