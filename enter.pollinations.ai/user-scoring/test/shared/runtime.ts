import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

export function loadDotenvEnv(dotenvPath: string): NodeJS.ProcessEnv {
    const env = { ...process.env };
    if (!existsSync(dotenvPath)) {
        return env;
    }

    for (const rawLine of readFileSync(dotenvPath, "utf-8").split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#") || !line.includes("=")) continue;
        const [key, ...rest] = line.split("=");
        const rawValue = rest.join("=").trim();
        const value =
            rawValue.startsWith('"') && rawValue.endsWith('"')
                ? rawValue.slice(1, -1)
                : rawValue.startsWith("'") && rawValue.endsWith("'")
                  ? rawValue.slice(1, -1)
                  : rawValue;
        if (!(key in env)) {
            env[key] = value;
        }
    }

    return env;
}

export function runNpm(
    cwd: string,
    args: string[],
    env: NodeJS.ProcessEnv,
    options?: { timeout?: number },
): void {
    execFileSync("npm", args, {
        cwd,
        env,
        stdio: "inherit",
        timeout: options?.timeout,
    });
}
