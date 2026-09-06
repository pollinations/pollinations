import {
    getAuthHeaders,
    getMaskedKey,
    requireApiKey,
    setApiKey,
} from "../utils/authUtils.js";
import { createMCPResponse, createTextContent } from "../utils/coreUtils.js";

const ENTER_URL =
    (typeof process !== "undefined" &&
        process.env?.POLLINATIONS_ENTER_URL?.trim()) ||
    "https://enter.pollinations.ai";
const CLIENT_ID = "pk_NgBAArhUeGvSRFba";
const SCOPE = "generate keys usage";

/** @type {{ deviceCode: string, expiresAt: Date } | null} */
let pendingDevice = null;

function toolResult(value) {
    return createMCPResponse([createTextContent(value, true)]);
}

export function clearPendingDevice() {
    pendingDevice = null;
}

export async function startDeviceLogin() {
    const response = await fetch(`${ENTER_URL}/api/device/code`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: CLIENT_ID,
            scope: SCOPE,
        }).toString(),
    });

    if (!response.ok) {
        throw new Error(
            `Failed to start device login: ${response.status} ${await response.text()}`,
        );
    }

    const code = await response.json();
    const expiresAt = new Date(Date.now() + code.expires_in * 1000);
    pendingDevice = { deviceCode: code.device_code, expiresAt };

    return toolResult({
        userCode: code.user_code,
        verificationUri: code.verification_uri_complete,
        expiresAt: expiresAt.toISOString(),
    });
}

export async function pollDeviceLogin() {
    if (!pendingDevice) {
        return toolResult({
            status: "error",
            message: "No pending login. Call startDeviceLogin first.",
        });
    }

    if (Date.now() > pendingDevice.expiresAt.getTime()) {
        clearPendingDevice();
        return toolResult({ status: "expired" });
    }

    const response = await fetch(`${ENTER_URL}/api/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            device_code: pendingDevice.deviceCode,
            client_id: CLIENT_ID,
        }).toString(),
    });
    const body = await response.json();

    if (response.ok && body.access_token) {
        setApiKey(body.access_token);
        clearPendingDevice();
        return toolResult({ status: "approved", maskedKey: getMaskedKey() });
    }

    if (body.error === "authorization_pending" || body.error === "slow_down") {
        return toolResult({ status: "pending" });
    }

    if (body.error === "expired_token") {
        clearPendingDevice();
        return toolResult({ status: "expired" });
    }

    clearPendingDevice();
    return toolResult({
        status: "error",
        message: body.error_description || body.error || "Device login failed.",
    });
}

export async function whoAmI(_params, context) {
    requireApiKey(context);

    const response = await fetch(`${ENTER_URL}/api/device/userinfo`, {
        headers: getAuthHeaders(context),
    });
    if (!response.ok) {
        throw new Error(
            `Failed to fetch user info: ${response.status} ${await response.text()}`,
        );
    }

    return toolResult(await response.json());
}

export const deviceLoginTools = [
    [
        "startDeviceLogin",
        "Start a Pollinations login without asking the user to paste an API key. Show the returned verification URL and user code, then call pollDeviceLogin after the user approves.",
        {},
        startDeviceLogin,
    ],
    [
        "pollDeviceLogin",
        "Check once whether the user approved a login started with startDeviceLogin. If it is still pending, wait for the user to confirm before trying again.",
        {},
        pollDeviceLogin,
    ],
    [
        "whoAmI",
        "Return the Pollinations account connected to this local MCP session.",
        {},
        whoAmI,
    ],
];
