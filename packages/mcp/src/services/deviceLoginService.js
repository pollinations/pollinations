import { z } from "zod";
import {
    getAuthHeaders,
    getMaskedKey,
    requireApiKey,
    setApiKey as storeApiKey,
} from "../utils/authUtils.js";
import { createMCPResponse, createTextContent } from "../utils/coreUtils.js";

const ENTER_URL =
    (typeof process !== "undefined" &&
        process.env?.POLLINATIONS_ENTER_URL?.trim()) ||
    "https://enter.pollinations.ai";

// Same default as the SDK's Pollinations.authorizeDevice() — never expose
// the device_code to the LLM, only the short user_code and the URL.
const DEVICE_FLOW_CLIENT_ID = "pk_NgBAArhUeGvSRFba";
const DEVICE_FLOW_DEFAULT_SCOPE = "generate keys usage";

/**
 * Module-local device-flow state. One pending login at a time per server
 * process. Cleared on success, expiry, or explicit clearApiKey.
 *
 * @type {{ deviceCode: string, userCode: string, expiresAt: Date } | null}
 */
let pendingDevice = null;

export function clearPendingDevice() {
    pendingDevice = null;
}

async function startDeviceLogin(params) {
    const scope = params?.scope || DEVICE_FLOW_DEFAULT_SCOPE;

    const res = await fetch(`${ENTER_URL}/api/device/code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            client_id: DEVICE_FLOW_CLIENT_ID,
            scope,
        }),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Failed to start device login: ${res.status} ${text}`);
    }

    const code = await res.json();
    const expiresAt = new Date(Date.now() + code.expires_in * 1000);

    pendingDevice = {
        deviceCode: code.device_code,
        userCode: code.user_code,
        expiresAt,
    };

    return createMCPResponse([
        createTextContent(
            {
                userCode: code.user_code,
                verificationUri: code.verification_uri_complete,
                expiresAt: expiresAt.toISOString(),
                message: `Ask the user to open ${code.verification_uri_complete} in their browser and approve. Tell them to reply when done, then call pollDeviceLogin.`,
            },
            true,
        ),
    ]);
}

async function pollDeviceLogin() {
    if (!pendingDevice) {
        return createMCPResponse([
            createTextContent(
                {
                    status: "error",
                    message:
                        "No pending device login. Call startDeviceLogin first.",
                },
                true,
            ),
        ]);
    }

    if (Date.now() > pendingDevice.expiresAt.getTime()) {
        clearPendingDevice();
        return createMCPResponse([
            createTextContent(
                {
                    status: "expired",
                    message:
                        "Device code expired. Call startDeviceLogin to start over.",
                },
                true,
            ),
        ]);
    }

    let res;
    try {
        res = await fetch(`${ENTER_URL}/api/device/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                device_code: pendingDevice.deviceCode,
                client_id: DEVICE_FLOW_CLIENT_ID,
                grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            }),
        });
    } catch (err) {
        return createMCPResponse([
            createTextContent(
                {
                    status: "error",
                    message: `Failed to poll device login: ${err instanceof Error ? err.message : err}`,
                },
                true,
            ),
        ]);
    }

    const body = await res.json().catch(() => ({}));

    if (res.ok && body.access_token) {
        storeApiKey(body.access_token);
        clearPendingDevice();
        return createMCPResponse([
            createTextContent(
                {
                    status: "approved",
                    maskedKey: getMaskedKey(),
                    message:
                        "Login approved. API key is now active for this session.",
                },
                true,
            ),
        ]);
    }

    if (body.error === "authorization_pending" || body.error === "slow_down") {
        return createMCPResponse([
            createTextContent(
                {
                    status: "pending",
                    message:
                        "Waiting for approval. Ask the user to approve, then call pollDeviceLogin again.",
                },
                true,
            ),
        ]);
    }

    if (body.error === "expired_token") {
        clearPendingDevice();
        return createMCPResponse([
            createTextContent(
                {
                    status: "expired",
                    message:
                        "Device code expired. Call startDeviceLogin to start over.",
                },
                true,
            ),
        ]);
    }

    clearPendingDevice();
    const denied = body.error === "access_denied";
    return createMCPResponse([
        createTextContent(
            {
                status: "error",
                message: denied
                    ? "Access denied. The user declined the authorization. Call startDeviceLogin to try again."
                    : body.error_description ||
                      body.error ||
                      "Device login failed",
            },
            true,
        ),
    ]);
}

async function whoAmI(_params, context) {
    requireApiKey(context);

    const res = await fetch(`${ENTER_URL}/api/device/userinfo`, {
        headers: getAuthHeaders(context),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`Failed to fetch user info: ${res.status} ${text}`);
    }

    const data = await res.json();

    return createMCPResponse([
        createTextContent(
            {
                sub: data.sub ?? null,
                name: data.name ?? null,
                email: data.email ?? null,
                preferredUsername: data.preferred_username ?? null,
                message: `Logged in as ${data.preferred_username || data.name || "unknown user"}.`,
            },
            true,
        ),
    ]);
}

export const deviceLoginTools = [
    [
        "startDeviceLogin",
        "Start a Pollinations device-flow login. Returns a user code and a verification URL the user must open in their browser and approve. Never ask the user to paste an API key into the chat. After they approve, call pollDeviceLogin to finish.",
        {
            scope: z
                .string()
                .optional()
                .describe("OAuth scope; defaults to 'generate keys usage'"),
        },
        startDeviceLogin,
    ],
    [
        "pollDeviceLogin",
        "Poll once for the result of a device login started with startDeviceLogin. Returns pending while the user has not approved, approved (and the session API key is set) once they have, or expired/error. Call it again after the user confirms approval.",
        {},
        pollDeviceLogin,
    ],
    [
        "whoAmI",
        "Confirm which user the currently set API key belongs to. Useful right after pollDeviceLogin returns approved.",
        {},
        whoAmI,
    ],
];
