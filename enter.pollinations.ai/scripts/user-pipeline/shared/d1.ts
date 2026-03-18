import { execFileSync } from "node:child_process";

type Environment = "staging";
type D1Row = Record<string, string | number | null>;

interface D1JsonResponse {
    results?: D1Row[];
}

function buildWranglerArgs(env: Environment, sql: string): string[] {
    return [
        "wrangler",
        "d1",
        "execute",
        "DB",
        "--remote",
        "--env",
        env,
        "--command",
        sql,
        "--json",
    ];
}

export function queryD1(env: Environment, sql: string): D1Row[] {
    const output = execFileSync("npx", buildWranglerArgs(env, sql), {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        maxBuffer: 100 * 1024 * 1024,
        cwd: process.cwd(),
    });

    const data = JSON.parse(output) as D1JsonResponse[];
    return data[0]?.results || [];
}

export function executeD1(env: Environment, sql: string): boolean {
    try {
        execFileSync("npx", buildWranglerArgs(env, sql), {
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
            maxBuffer: 20 * 1024 * 1024,
            cwd: process.cwd(),
        });
        return true;
    } catch (error) {
        console.error(
            "❌ D1 mutation failed:",
            error instanceof Error ? error.message : String(error),
        );
        return false;
    }
}
