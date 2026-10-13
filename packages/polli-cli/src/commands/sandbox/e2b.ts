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

// E2B ends a run after 24 hours. Past that, gen keeps a sandbox running until
// its timeout, renewing it every hour with the key that set it.
export const RUN_SECONDS = 24 * 3600;
// E2B's largest timeout, about 68 years: polli's "never expires".
export const KEEP_SECONDS = 2 ** 31 - 1;

export const createSandbox = (templateID: string, timeout = LEASE_SECONDS) =>
    gen<Connection>(`${E2B_PATH}/sandboxes`, {
        method: "POST",
        body: { templateID, timeout, autoPause: true },
    });

// Running and paused ones.
export const listSandboxes = () => gen<Sandbox[]>(`${E2B_PATH}/v2/sandboxes`);

export const getSandbox = (id: string) =>
    gen<Sandbox>(`${E2B_PATH}/sandboxes/${id}`);

// E2B answers 204 with no body.
export const killSandbox = (id: string) =>
    genText(`${E2B_PATH}/sandboxes/${id}`, { method: "DELETE" });

// Resumes a paused sandbox and keeps it running for at least `timeout`
// seconds, paying in advance for time not yet paid.
export const connectSandbox = (id: string, timeout = LEASE_SECONDS) =>
    gen<Connection>(`${E2B_PATH}/sandboxes/${id}/connect`, {
        method: "POST",
        body: { timeout },
    });

// Paused sandboxes keep their files and memory and cost nothing. A pause ends
// a timeout over 24 hours.
export const pauseSandbox = (id: string) =>
    genText(`${E2B_PATH}/sandboxes/${id}/pause`, { method: "POST" });

// E2B's system log: sandbox start, and each process started through it.
export const sandboxLogs = (id: string) =>
    gen<{ logEntries: LogEntry[] }>(`${E2B_PATH}/sandboxes/${id}/logs`);
