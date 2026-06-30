import { Command, Option } from "commander";
import { gen } from "../lib/api.js";
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
import { t } from "../lib/i18n.js";
import { startSpinner, stopSpinner } from "../lib/spinner.js";
import { validate } from "../lib/validation.js";
import {
    ProfileResponseSchema,
    BalanceResponseSchema,
    DeviceCodeResponseSchema,
    DeviceTokenResponseSchema,
} from "../lib/validation.js";
import { logActivity } from "../lib/logger.js";

type LoginOptions = {
    browser?: boolean;
    token?: string;
    withToken?: boolean;
};

async function pollForToken(
    deviceCode: string,
    interval: number,
    expiresIn: number,
): Promise<{ access_token?: string; error?: string; error_description?: string }> {
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
        const body = DeviceTokenResponseSchema.parse(await res.json());
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

async function storeKey(key: string): Promise<void> {
    const keyType = key.startsWith("sk_") ? "sk" : "pk";
    await saveCredentials({ apiKey: key, keyType });
}

function assertApiKey(key: string): string {
    const trimmed = key.trim();
    if (!trimmed.startsWith("pk_") && !trimmed.startsWith("sk_")) {
        printError("Invalid key format. Must start with pk_ or sk_");
        process.exit(1);
    }
    return trimmed;
}

async function readStdinToken(): Promise<string> {
    if (process.stdin.isTTY) {
        printError(
            "--with-token expects a key on stdin, e.g. printf '%s' \"$KEY\" | polli auth login --with-token",
        );
        process.exit(1);
    }
    let text = "";
    for await (const chunk of process.stdin) {
        text += chunk;
    }
    return text.trim();
}

async function authenticateWithKey(key: string): Promise<void> {
    await storeKey(key);
    printSuccess(t("auth.login.success"));
    const label = await fetchProfileLabel(key);
    if (label) {
        printSuccess(label);
    } else {
        printInfo("Key stored but could not verify. It may still be valid.");
    }
    printInfo(flavor.login);
    logActivity("auth_login", { method: "key" });
}

async function fetchProfileLabel(key: string): Promise<string | null> {
    const profile = await gen("/account/profile", { apiKey: key }).catch(() => null);
    if (!profile) return null;
    const validated = ProfileResponseSchema.safeParse(profile);
    if (!validated.success) return null;
    return t("auth.status.name", { name: validated.data.githubUsername ?? "unknown" });
}

const login = new Command("login")
    .description("Authenticate with Pollinations")
    .addOption(
        new Option(
            "--token <key>",
            "API key (pk_ or sk_) for direct auth",
        ).hideHelp(),
    )
    .option("--with-token", "Read an existing API key from stdin")
    .option("--no-browser", "Print URL instead of opening browser")
    .action(async (opts: LoginOptions) => {
        if (opts.token) {
            await authenticateWithKey(assertApiKey(opts.token));
            return;
        }
        if (opts.withToken) {
            const key = assertApiKey(await readStdinToken());
            await authenticateWithKey(key);
            return;
        }

        printInfo(t("auth.login.device"));
        const res = await fetch(`${ENTER_URL}/api/device/code`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                client_id: "pk_VZF38YW4tQX36SEn",
                scope: "generate profile usage keys",
            }),
        }).catch((err) => {
            printError(
                `Failed to start device flow: ${err instanceof Error ? err.message : err}`,
            );
            printInfo(t("auth.login.fallback"));
            printInfo(t("auth.login.getkey"));
            process.exit(1);
        });
        if (!res.ok) {
            printError(
                `Failed to start device flow: ${res.status} ${await res.text()}`,
            );
            process.exit(1);
        }
        const deviceResp = DeviceCodeResponseSchema.parse(await res.json());

        printInfo(`\n${t("auth.login.code", { code: deviceResp.user_code })}\n`);
        const url = deviceResp.verification_uri_complete;
        printInfo(`${t("auth.login.open")}\n  ${url}`);
        if (opts.browser !== false) {
            const open = (await import("open")).default;
            await open(url).catch(() =>
                printInfo("Could not open browser automatically."),
            );
        }
        printInfo(t("auth.login.waiting"));
        startSpinner("Waiting for approval...");

        const tokenResp = await pollForToken(
            deviceResp.device_code,
            deviceResp.interval,
            deviceResp.expires_in,
        );
        stopSpinner(true);

        if (!tokenResp.access_token) {
            let errMsg: string;
            switch (tokenResp.error) {
                case "access_denied":
                    errMsg = t("auth.login.denied");
                    break;
                case "expired_token":
                    errMsg = t("auth.login.expired");
                    break;
                default:
                    errMsg = t("auth.login.failed", {
                        reason: tokenResp.error_description ?? tokenResp.error,
                    });
            }
            printError(errMsg);
            process.exit(1);
        }

        const key = tokenResp.access_token;
        await storeKey(key);
        printSuccess(t("auth.login.success"));
        const label = await fetchProfileLabel(key);
        if (label) {
            printSuccess(label);
        } else {
            printInfo("Key stored. Could not fetch profile, but auth is complete.");
        }
        printInfo(flavor.login);
        logActivity("auth_login", { method: "device" });
    });

const logout = new Command("logout")
    .description("Clear stored credentials")
    .action(async () => {
        await clearCredentials();
        printSuccess(t("auth.logout.success"));
        printInfo(flavor.logout);
        logActivity("auth_logout", {});
    });

export async function showAuthStatus(): Promise<void> {
    const key = await resolveApiKey();
    if (!key) {
        printResult({
            authenticated: false,
            message: t("auth.status.not"),
        });
        return;
    }
    const masked = `${key.slice(0, 5)}...${key.slice(-6)}`;
    const [profile, balance] = await Promise.all([
        gen("/account/profile", { apiKey: key }).catch(() => null),
        gen("/account/balance", { apiKey: key }).catch(() => null),
    ]);
    const profileValid = ProfileResponseSchema.safeParse(profile);
    const balanceValid = BalanceResponseSchema.safeParse(balance);

    if (!profileValid.success) {
        printResult({
            authenticated: true,
            key: masked,
            status: t("auth.status.key"),
        });
        return;
    }
    printResult({
        authenticated: true,
        key: masked,
        name: profileValid.data.githubUsername ?? "unknown",
        pollen: balanceValid.success ? balanceValid.data.balance : "unknown",
    });
}

const status = new Command("status")
    .description("Show current auth status and balance")
    .action(showAuthStatus);

export const authCommand = new Command("auth")
    .description("Login, logout, and check auth status")
    .addCommand(login)
    .addCommand(logout)
    .addCommand(status);