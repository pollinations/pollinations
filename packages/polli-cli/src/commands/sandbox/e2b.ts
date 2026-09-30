import { gen, genText } from "../../lib/api.js";

// Gen serves E2B's API here, so E2B's own CLI and SDKs work against it.
export const E2B_PATH = "/alpha/e2b";
// Each create or connect keeps the sandbox paid for this long.
export const LEASE_SECONDS = 600;

export interface Connection {
    sandboxID: string;
    domain?: string | null;
    envdAccessToken?: string;
    trafficAccessToken?: string | null;
}

// Paused, not killed, when its paid time runs out.
export const createSandbox = (templateID: string, timeout: number) =>
    gen<Connection>(`${E2B_PATH}/sandboxes`, {
        method: "POST",
        body: { templateID, timeout, autoPause: true },
    });

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
