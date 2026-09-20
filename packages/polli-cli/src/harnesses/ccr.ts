import { spawn } from "node:child_process";
import { join } from "node:path";
import { BASE_URL } from "../lib/config.js";
import { commandExists, readTextIfExists } from "./fs.js";
import type { HarnessContext } from "./types.js";

/** Claude Code Router's own management RPC, the same API its UI uses. */
export interface CcrConfig {
    Providers: CcrProvider[];
    profile: { profiles: CcrProfile[] };
    APIKEY: string;
    [key: string]: unknown;
}
export interface CcrProvider {
    id?: string;
    name: string;
    api_base_url: string;
    api_key: string;
    models: string[];
}
export interface CcrProfile {
    id: string;
    name: string;
    agent: string;
    model: string;
    enabled: boolean;
    [key: string]: unknown;
}

export const PROVIDER_NAME = "pollinations";
export const PROFILE_ID = "pollinations-claude-code";
export const CCR_INSTALL = "npm install -g @musistudio/claude-code-router";

export const ccrDir = (ctx: HarnessContext) =>
    process.platform === "win32"
        ? join(
              ctx.env.APPDATA ?? join(ctx.home, "AppData", "Roaming"),
              "claude-code-router",
          )
        : join(ctx.home, ".claude-code-router");

const serviceFile = (ctx: HarnessContext) => join(ccrDir(ctx), "service.json");

const alive = (pid: number) => {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
};

const readService = (ctx: HarnessContext) => {
    const text = readTextIfExists(serviceFile(ctx));
    if (!text) return null;
    const { pid, url } = JSON.parse(text) as { pid: number; url: string };
    if (!alive(pid)) return null;
    const parsed = new URL(url);
    return {
        origin: parsed.origin,
        token: parsed.searchParams.get("ccr_web_token") ?? "",
    };
};

/** Start the detached CCR service (`ccr start --daemon`) unless one is running. */
export const ensureService = async (ctx: HarnessContext) => {
    let service = readService(ctx);
    if (!service) {
        spawn("ccr", ["start", "--daemon", "--no-open"], {
            env: ctx.env,
            shell: process.platform === "win32",
            stdio: "ignore",
        }).unref();
        for (let i = 0; i < 40 && !service; i++) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            service = readService(ctx);
        }
    }
    if (!service)
        throw new Error("Claude Code Router did not start. Run: ccr start");
    return service;
};

export const serviceRunning = (ctx: HarnessContext) =>
    readService(ctx) !== null;
export const ccrInstalled = (ctx: HarnessContext) =>
    commandExists("ccr", ctx.env);

export const rpc = async <T>(
    service: { origin: string; token: string },
    method: string,
    ...args: unknown[]
): Promise<T> => {
    const res = await fetch(`${service.origin}/api/ccr/rpc`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "x-ccr-web-auth": service.token,
        },
        body: JSON.stringify({ method, args }),
    });
    const body = (await res.json()) as {
        ok: boolean;
        value: T;
        error?: { message: string };
    };
    if (!body.ok) throw new Error(`CCR ${method}: ${body.error?.message}`);
    return body.value;
};

export const providerFor = (config: CcrConfig) =>
    config.Providers.find((p) => p.name === PROVIDER_NAME);

export const gatewayBase = `${BASE_URL}/v1`;
