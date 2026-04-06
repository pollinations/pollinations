import { execSync } from "node:child_process";

type D1ExecuteResponse = Array<{
    results?: Record<string, unknown>[];
}>;

export function queryD1(
    sql: string,
    env: "staging" | "production" = "production",
): Record<string, unknown>[] {
    const result = execSync(
        `npx wrangler d1 execute DB --remote --env ${env} --json --command "${sql}"`,
        { encoding: "utf-8", maxBuffer: 100 * 1024 * 1024 },
    );

    const data = JSON.parse(result) as D1ExecuteResponse;
    return data[0]?.results ?? [];
}
