import { join } from "node:path";
import { commandExists, readTextIfExists } from "./fs.js";
import type { HarnessContext } from "./types.js";

export interface CcrProvider {
    id?: string;
    name: string;
    provider?: string;
    type?: string;
    api_base_url?: string;
    api_key?: string;
    models: string[];
    enabled?: boolean;
    [key: string]: unknown;
}

export interface CcrProfile {
    id: string;
    name: string;
    agent: string;
    enabled: boolean;
    model: string;
    scope?: string;
    surface?: string;
    [key: string]: unknown;
}

export interface CcrConfig {
    APIKEY: string;
    Providers: CcrProvider[];
    profile: { profiles: CcrProfile[]; [key: string]: unknown };
    [key: string]: unknown;
}

export interface CcrService {
    origin: string;
    token: string;
}

export const CCR_INSTALL =
    "npm install -g @musistudio/claude-code-router@latest";

export const ccrDir = (ctx: HarnessContext) =>
    ctx.env.CCR_CONFIG_DIR?.trim() ||
    (process.platform === "win32"
        ? join(
              ctx.env.APPDATA ?? join(ctx.home, "AppData", "Roaming"),
              "claude-code-router",
          )
        : join(ctx.home, ".claude-code-router"));

const serviceFile = (ctx: HarnessContext) => join(ccrDir(ctx), "service.json");

const processAlive = (pid: number) => {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
};

export const readCcrService = (ctx: HarnessContext): CcrService | null => {
    const text = readTextIfExists(serviceFile(ctx));
    if (!text) return null;
    try {
        const state = JSON.parse(text) as { pid?: number; url?: string };
        if (!state.pid || !state.url || !processAlive(state.pid)) return null;
        const url = new URL(state.url);
        const token = url.searchParams.get("ccr_web_token") ?? "";
        if (!token) return null;
        return { origin: url.origin, token };
    } catch {
        return null;
    }
};

export const ccrInstalled = (ctx: HarnessContext) =>
    commandExists("ccr", ctx.env);

export const ccrServiceRunning = (ctx: HarnessContext) =>
    readCcrService(ctx) !== null;

export const requireCcrService = (ctx: HarnessContext) => {
    const service = readCcrService(ctx);
    if (!service) {
        throw new Error(
            "Claude Code Router is not running. Start it first with: ccr start",
        );
    }
    return service;
};

export const ccrRpc = async <T>(
    service: CcrService,
    method: string,
    ...args: unknown[]
): Promise<T> => {
    const response = await fetch(`${service.origin}/api/ccr/rpc`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "x-ccr-web-auth": service.token,
        },
        body: JSON.stringify({ method, args }),
    });
    const text = await response.text();
    if (!response.ok) {
        throw new Error(
            `Claude Code Router RPC ${method} failed (${response.status}): ${text.slice(0, 400)}`,
        );
    }
    const body = JSON.parse(text) as {
        ok?: boolean;
        value?: T;
        error?: { message?: string };
    };
    if (body.ok !== true) {
        throw new Error(
            `Claude Code Router RPC ${method} failed: ${body.error?.message ?? "unknown error"}`,
        );
    }
    return body.value as T;
};
