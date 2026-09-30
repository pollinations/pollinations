import { gen, genText } from "../../lib/api.js";

// Gen serves E2B's API here, so E2B's own CLI and SDKs work against it.
const E2B_PATH = "/alpha/e2b";
// Each create or connect keeps the sandbox paid for this long.
export const LEASE_SECONDS = 600;

export interface Connection {
    sandboxID: string;
    domain?: string | null;
    envdAccessToken?: string;
    trafficAccessToken?: string | null;
}

export type Sandbox = {
    sandboxID: string;
    templateID: string;
    alias?: string;
    state: string;
    cpuCount: number;
    memoryMB: number;
    endAt: string;
};

export interface LogEntry {
    timestamp: string;
    level: string;
    message: string;
    fields: Record<string, string>;
}

// Paused, not killed, when its paid time runs out.
export const createSandbox = (templateID: string, timeout: number) =>
    gen<Connection>(`${E2B_PATH}/sandboxes`, {
        method: "POST",
        body: { templateID, timeout, autoPause: true },
    });

// `state` is "running", "paused" or both, comma-separated. E2B lists both
// when it is left out.
export const listSandboxes = (state?: string) =>
    gen<Sandbox[]>(
        `${E2B_PATH}/v2/sandboxes${state ? `?${new URLSearchParams({ state })}` : ""}`,
    );

export const getSandbox = (id: string) =>
    gen<Sandbox>(`${E2B_PATH}/sandboxes/${id}`);

// E2B answers 204 with no body.
export const killSandbox = (id: string) =>
    genText(`${E2B_PATH}/sandboxes/${id}`, { method: "DELETE" });

// E2B answers 204 with no body.
export const pauseSandbox = (id: string) =>
    genText(`${E2B_PATH}/sandboxes/${id}/pause`, { method: "POST" });

// Keeps the sandbox running until `timeout` seconds from now, paying in
// advance for time not yet paid. E2B answers 204 with no body.
export const setSandboxTimeout = (id: string, timeout: number) =>
    genText(`${E2B_PATH}/sandboxes/${id}/timeout`, {
        method: "POST",
        body: { timeout },
    });

// Resumes a paused sandbox and makes sure it is paid for LEASE_SECONDS.
export const connectSandbox = (id: string) =>
    gen<Connection>(`${E2B_PATH}/sandboxes/${id}/connect`, {
        method: "POST",
        body: { timeout: LEASE_SECONDS },
    });

// E2B's system log: sandbox start, and each process started through it.
export const sandboxLogs = (id: string) =>
    gen<{ logEntries: LogEntry[] }>(`${E2B_PATH}/sandboxes/${id}/logs`);
