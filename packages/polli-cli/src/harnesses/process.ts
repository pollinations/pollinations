import { spawnSync } from "node:child_process";
import type { HarnessContext } from "./types.js";

export interface CommandResult {
    status: number;
    stdout: string;
    stderr: string;
}

/** Run a fixed harness command without putting credentials in argv or output. */
export const runHarnessCommand = (
    command: string,
    args: string[],
    ctx: HarnessContext,
    timeout = 330_000,
): CommandResult => {
    const result = spawnSync(command, args, {
        encoding: "utf-8",
        env: ctx.env,
        shell: process.platform === "win32",
        timeout,
        windowsHide: true,
    });
    if (result.error) throw result.error;
    return {
        status: result.status ?? 1,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
    };
};

export const requireSuccessfulCommand = (
    command: string,
    args: string[],
    ctx: HarnessContext,
    timeout?: number,
) => {
    const result = runHarnessCommand(command, args, ctx, timeout);
    if (result.status !== 0) {
        const detail = result.stderr.trim() || result.stdout.trim();
        throw new Error(
            `${command} ${args.join(" ")} exited with status ${result.status}${detail ? `: ${detail}` : ""}`,
        );
    }
    return result;
};

const parseVersion = (value: string) => {
    const match = value.match(/(?:^|\s|v)(\d+)\.(\d+)\.(\d+)(?:[-+][^\s]+)?/u);
    return match
        ? ([Number(match[1]), Number(match[2]), Number(match[3])] as const)
        : null;
};

const compareVersions = (
    left: readonly number[],
    right: readonly number[],
) => {
    for (let index = 0; index < 3; index++) {
        const difference = (left[index] ?? 0) - (right[index] ?? 0);
        if (difference !== 0) return difference;
    }
    return 0;
};

export const requireCompatibleVersion = (
    label: string,
    current: string,
    minimum: string,
    nextMajor: string,
) => {
    const have = parseVersion(current);
    const min = parseVersion(minimum);
    const max = parseVersion(nextMajor);
    if (!have || !min || !max) {
        throw new Error(
            `Could not read ${label} version from ${JSON.stringify(current.trim())}`,
        );
    }
    if (compareVersions(have, min) < 0 || compareVersions(have, max) >= 0) {
        throw new Error(
            `${label} ${have.join(".")} is unsupported. Install ${minimum} or newer, before ${nextMajor}.`,
        );
    }
    return have.join(".");
};
