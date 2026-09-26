import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { SourceInfo } from "./flow-environment";

const exec = promisify(execFile);
const repository = fileURLToPath(new URL("../../", import.meta.url));

export async function readSourceInfo(): Promise<SourceInfo> {
    const { FLOW_REVISION, FLOW_MAIN_REVISION, FLOW_DIRTY } = process.env;
    if (FLOW_REVISION || FLOW_MAIN_REVISION || FLOW_DIRTY) {
        if (
            !FLOW_REVISION ||
            !/^[a-f0-9]{40}$/.test(FLOW_REVISION) ||
            !FLOW_MAIN_REVISION ||
            !/^[a-f0-9]{40}$/.test(FLOW_MAIN_REVISION) ||
            !["true", "false"].includes(FLOW_DIRTY ?? "")
        )
            throw new Error(
                "Packaged Flow requires FLOW_REVISION, FLOW_MAIN_REVISION (full Git SHAs) and FLOW_DIRTY (true or false)",
            );
        return {
            revision: FLOW_REVISION,
            mainRevision: FLOW_MAIN_REVISION,
            dirty: FLOW_DIRTY === "true",
        };
    }
    const git = async (...args: string[]) =>
        (await exec("git", args, { cwd: repository })).stdout.trim();
    const [revision, mainRevision, status] = await Promise.all([
        git("rev-parse", "HEAD"),
        git("merge-base", "HEAD", "origin/main"),
        git("status", "--porcelain"),
    ]);
    return { revision, mainRevision, dirty: status.length > 0 };
}
