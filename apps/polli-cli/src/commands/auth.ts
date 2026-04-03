import { Command } from "commander";
import ora from "ora";
import { enter } from "../lib/api.js";
import {
    clearCredentials,
    ENTER_URL,
    resolveApiKey,
    saveCredentials,
} from "../lib/config.js";
import {
    getOutputMode,
    printError,
    printInfo,
    printResult,
    printSuccess,
} from "../lib/output.js";

interface ProfileResponse {
    name?: string;
    email?: string;
    tier?: string;
    createdAt?: string;
}

interface BalanceResponse {
    balance?: number;
    tier?: string;
    cadence?: string;
}

interface DeviceCodeResponse {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete: string;
    expires_in: number;
    interval: number;
}

interface DeviceTokenResponse {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
}

/** Poll the device token endpoint until approval, denial, or expiry. */
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

        if (res.ok && body.access_token) {
            return body;
        }

        if (
            body.error === "authorization_pending" ||
            body.error === "slow_down"
        ) {
            continue;
        }

        // Terminal errors: access_denied, expired_token, etc.
        return body;
    }

    return { error: "expired_token", error_description: "Device code expired" };
}

const login = new Command("login")
    .description("Authenticate with Pollinations")
    .option("--token <key>", "API key (pk_ or sk_) for direct auth")
    .option("--no-browser", "Print URL instead of opening browser")
    .action(async (opts) => {
        // Direct token login (for AI agents)
        if (opts.token) {
            const key = opts.token as string;
            if (!key.startsWith("pk_") && !key.startsWith("sk_")) {
                printError("Invalid key format. Must start with pk_ or sk_");
                process.exit(1);
            }

            const keyType = key.startsWith("pk_") ? "pk" : "sk";
            saveCredentials({ apiKey: key, keyType: keyType as "pk" | "sk" });
            printSuccess("Authenticated. Key stored.");

            // Verify the key works
            const isHuman = getOutputMode() === "human";
            const spinner = isHuman ? ora("Verifying key...").start() : null;
            try {
                const profile = await enter<ProfileResponse>(
                    "/api/account/profile",
                    {
                        apiKey: key,
                    },
                );
                const msg = `Logged in as ${profile.name ?? profile.email ?? "unknown"} (${profile.tier ?? "unknown"} tier)`;
                spinner?.succeed(msg) ?? printSuccess(msg);
            } catch {
                const msg =
                    "Key stored but could not verify. It may still be valid.";
                spinner?.warn(msg) ?? printInfo(msg);
            }
            return;
        }

        // Device flow (RFC 8628) — opens browser for GitHub login + key approval
        const isHuman = getOutputMode() === "human";
        const spinner = isHuman
            ? ora("Requesting device code...").start()
            : null;

        let deviceResp: DeviceCodeResponse;
        try {
            const res = await fetch(`${ENTER_URL}/api/device/code`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    client_id: "polli-cli",
                    scope: "generate",
                }),
            });
            if (!res.ok) {
                const text = await res.text().catch(() => "Unknown error");
                throw new Error(`${res.status}: ${text}`);
            }
            deviceResp = (await res.json()) as DeviceCodeResponse;
        } catch (err) {
            const msg = `Failed to start device flow: ${err instanceof Error ? err.message : err}`;
            spinner?.fail(msg) ?? printError(msg);
            printInfo("Fallback: polli auth login --token <your-key>");
            printInfo("Get your key at: https://enter.pollinations.ai");
            process.exit(1);
        }

        spinner?.stop();

        // Show user code prominently
        printInfo(`\nYour code: ${deviceResp.user_code}\n`);

        // Open browser or print URL
        const url = deviceResp.verification_uri_complete;
        if (opts.browser !== false) {
            try {
                const open = (await import("open")).default;
                await open(url);
                printInfo(
                    "Browser opened. Sign in with GitHub and approve the code.",
                );
            } catch {
                printInfo(`Open this URL in your browser:\n  ${url}`);
            }
        } else {
            printInfo(`Open this URL in your browser:\n  ${url}`);
        }

        // Poll for token
        const pollSpinner = isHuman
            ? ora("Waiting for approval...").start()
            : null;

        const tokenResp = await pollForToken(
            deviceResp.device_code,
            deviceResp.interval,
            deviceResp.expires_in,
        );

        if (!tokenResp.access_token) {
            const errMsg =
                tokenResp.error === "access_denied"
                    ? "Access denied. You declined the authorization."
                    : tokenResp.error === "expired_token"
                      ? "Code expired. Run `polli auth login` to try again."
                      : `Login failed: ${tokenResp.error_description ?? tokenResp.error}`;
            pollSpinner?.fail(errMsg) ?? printError(errMsg);
            process.exit(1);
        }

        // Store the key
        const key = tokenResp.access_token;
        const keyType = key.startsWith("sk_") ? "sk" : "pk";
        saveCredentials({ apiKey: key, keyType: keyType as "pk" | "sk" });
        pollSpinner?.succeed("Authenticated!") ??
            printSuccess("Authenticated!");

        // Verify and show profile
        try {
            const profile = await enter<ProfileResponse>(
                "/api/account/profile",
                {
                    apiKey: key,
                },
            );
            printSuccess(
                `Logged in as ${profile.name ?? profile.email ?? "unknown"} (${profile.tier ?? "unknown"} tier)`,
            );
        } catch {
            printInfo(
                "Key stored. Could not fetch profile, but auth is complete.",
            );
        }
    });

const logout = new Command("logout")
    .description("Clear stored credentials")
    .action(() => {
        clearCredentials();
        printSuccess("Logged out. Credentials cleared.");
    });

const status = new Command("status")
    .description("Show current auth status, tier, and balance")
    .action(async () => {
        const key = resolveApiKey();
        if (!key) {
            printResult({
                authenticated: false,
                message: "Not logged in. Run: polli auth login",
            });
            return;
        }

        const masked = `${key.slice(0, 5)}...${key.slice(-6)}`;

        try {
            const [profile, balance] = await Promise.all([
                enter<ProfileResponse>("/api/account/profile", { apiKey: key }),
                enter<BalanceResponse>("/api/account/balance", {
                    apiKey: key,
                }).catch(() => null),
            ]);

            printResult({
                authenticated: true,
                key: masked,
                name: profile.name ?? profile.email ?? "unknown",
                tier: profile.tier ?? "unknown",
                pollen: balance?.balance ?? "unknown",
                cadence: balance?.cadence ?? "unknown",
            });
        } catch {
            printResult({
                authenticated: true,
                key: masked,
                status: "Key stored but could not reach API",
            });
        }
    });

export const authCommand = new Command("auth")
    .description("Login, logout, and check auth status")
    .addCommand(login)
    .addCommand(logout)
    .addCommand(status);
