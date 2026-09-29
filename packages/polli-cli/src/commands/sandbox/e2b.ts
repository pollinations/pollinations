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

export interface Sandbox {
    sandboxID: string;
    templateID: string;
    alias?: string;
    state: string;
    cpuCount: number;
    memoryMB: number;
    endAt: string;
}

// Paused, not killed, when its paid time runs out.
export const createSandbox = (templateID: string) =>
    gen<Connection>(`${E2B_PATH}/sandboxes`, {
        method: "POST",
        body: { templateID, timeout: LEASE_SECONDS, autoPause: true },
    });

export const listSandboxes = () => gen<Sandbox[]>(`${E2B_PATH}/v2/sandboxes`);

// E2B answers 204 with no body.
export const killSandbox = (id: string) =>
    genText(`${E2B_PATH}/sandboxes/${id}`, { method: "DELETE" });

// Resumes a paused sandbox and makes sure it is paid for LEASE_SECONDS.
export const connectSandbox = (id: string) =>
    gen<Connection>(`${E2B_PATH}/sandboxes/${id}/connect`, {
        method: "POST",
        body: { timeout: LEASE_SECONDS },
    });
