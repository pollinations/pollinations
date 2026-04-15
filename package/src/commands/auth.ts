import { Command } from "commander";
import { enter } from "../lib/api.js";
import {
    clearCredentials,
    ENTER_URL,
    resolveApiKey,
    saveCredentials,
} from "../lib/config.js";
import {
    printError,
    printInfo,
    printResult,
    printSuccess,
} from "../lib/output.js";
import { flavor } from "../lib/quotes.js";

interface ProfileResponse {
    name?: string;
    email?: string;
    tier?: string;
}

interface BalanceResponse {
    balance?: number;
    cadence?: string;
}

interface DeviceCodeResponse {
    device_code: string;
    user_code: string;
    verification_uri_complete: string;
    expires_in: number;
    interval: number;
}

interface DeviceTokenResponse {
    access_token?: string;
    error?: string;
    error_description?: string;
}

async function pollForToken(
    deviceCode: string,
    interval: number,
    expiresIn: number,
): Promise<DeviceTokenResponse> {
    const deadline = Date.now() + expiresIn * 1000;
    const pollMs = Math.max(interval, 5) * 1000;

    while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, pollMs));

        const res = await fetch(`${ENTER_URL}/api/device/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                device_code: deviceCode,
                grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            }),
        });

        const body = (await res.json()) as DeviceTokenResponse;
        if (res.ok && body.access_token) return body;
        if (
            body.error === "authorization_pending" ||
            body.error === "slow_down"
        )
            continue;
        return body;
    }

    return { error: "expired_token", error_description: "Device code expired" };
}

function storeKey(key: string): void {
    const keyType = key.startsWith("sk_") ? "sk" : "pk";
    saveCredentials({ apiKey: key, keyType });
}

async function fetchProfileLabel(key: string): Promise<string | null> {
    const profile = await enter<ProfileResponse>("/api/account/profile", {
        apiKey: key,
    }).catch(() => null);
    if (!profile) return null;
    return `Logged in as ${profile.name ?? profile.email ?? "unknown"} (${profile.tier ?? "unknown"} tier)`;
}

const login = new Command("login")
    .description("Authenticate with Pollinations")
    .option("--token <key>", "API key (pk_ or sk_) for direct auth")
    .option("--no-browser", "Print URL instead of opening browser")
    .action(async (opts) => {
        if (opts.token) {
            const key = opts.token as string;
            if (!key.startsWith("pk_") && !key.startsWith("sk_")) {
                printError("Invalid key format. Must start with pk_ or sk_");
                process.exit(1);
            }

            storeKey(key);
            printSuccess("Authenticated. Key stored.");

            const label = await fetchProfileLabel(key);
            if (label) {
                printSuccess(label);
            } else {
                printInfo(
                    "Key stored but could not verify. It may still be valid.",
                );
            }
            printInfo(flavor.login);
            return;
        }

        printInfo("Requesting device code...");

        const res = await fetch(`${ENTER_URL}/api/device/code`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                client_id: "pk_NgBAArhUeGvSRFba",
                scope: "generate keys balance usage",
            }),
        }).catch((err) => {
            printError(
                `Failed to start device flow: ${err instanceof Error ? err.message : err}`,
            );
            printInfo("Fallback: polli auth login --token <your-key>");
            printInfo("Get your key at: https://enter.pollinations.ai");
            process.exit(1);
        });

        if (!res.ok) {
            printError(
                `Failed to start device flow: ${res.status} ${await res.text()}`,
            );
            process.exit(1);
        }

        const deviceResp = (await res.json()) as DeviceCodeResponse;

        printInfo(`\nYour code: ${deviceResp.user_code}\n`);

        const url = deviceResp.verification_uri_complete;
        if (opts.browser !== false) {
            const open = (await import("open")).default;
            await open(url).then(
                () =>
                    printInfo(
                        "Browser opened. Sign in with GitHub and approve the code.",
                    ),
                () => printInfo(`Open this URL in your browser:\n  ${url}`),
            );
        } else {
            printInfo(`Open this URL in your browser:\n  ${url}`);
        }

        printInfo("Waiting for approval...");
        const tokenResp = await pollForToken(
            deviceResp.device_code,
            deviceResp.interval,
            deviceResp.expires_in,
        );

        if (!tokenResp.access_token) {
            let errMsg: string;
            switch (tokenResp.error) {
                case "access_denied":
                    errMsg = "Access denied. You declined the authorization.";
                    break;
                case "expired_token":
                    errMsg =
                        "Code expired. Run `polli auth login` to try again.";
                    break;
                default:
                    errMsg = `Login failed: ${tokenResp.error_description ?? tokenResp.error}`;
            }
            printError(errMsg);
            process.exit(1);
        }

        const key = tokenResp.access_token;
        storeKey(key);
        printSuccess("Authenticated!");

        const label = await fetchProfileLabel(key);
        if (label) {
            printSuccess(label);
        } else {
            printInfo(
                "Key stored. Could not fetch profile, but auth is complete.",
            );
        }
        printInfo(flavor.login);
    });

const logout = new Command("logout")
    .description("Clear stored credentials")
    .action(() => {
        clearCredentials();
        printSuccess("Logged out. Credentials cleared.");
        printInfo(flavor.logout);
    });

export async function showAuthStatus(): Promise<void> {
    const key = resolveApiKey();
    if (!key) {
        printResult({
            authenticated: false,
            message: "Not logged in. Run: polli auth login",
        });
        return;
    }

    const masked = `${key.slice(0, 5)}...${key.slice(-6)}`;

    const [profile, balance] = await Promise.all([
        enter<ProfileResponse>("/api/account/profile", { apiKey: key }).catch(
            () => null,
        ),
        enter<BalanceResponse>("/api/account/balance", { apiKey: key }).catch(
            () => null,
        ),
    ]);

    if (!profile) {
        printResult({
            authenticated: true,
            key: masked,
            status: "Key stored but could not reach API",
        });
        return;
    }

    printResult({
        authenticated: true,
        key: masked,
        name: profile.name ?? profile.email ?? "unknown",
        tier: profile.tier ?? "unknown",
        pollen: balance?.balance ?? "unknown",
        cadence: balance?.cadence ?? "unknown",
    });
}

const status = new Command("status")
    .description("Show current auth status, tier, and balance")
    .action(showAuthStatus);

export const authCommand = new Command("auth")
    .description("Login, logout, and check auth status")
    .addCommand(login)
    .addCommand(logout)
    .addCommand(status);
