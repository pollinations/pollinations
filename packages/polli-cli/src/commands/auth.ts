import chalk from "chalk";
import { Command, Option } from "commander";
import { gen } from "../lib/api.js";
import { printBanner } from "../lib/branding.js";
import {
    clearCredentials,
    credentialsDisplayPath,
    ENTER_URL,
    resolveApiKey,
    saveCredentials,
} from "../lib/config.js";
import {
    getOutputMode,
    link,
    printError,
    printInfo,
    printResult,
    printSuccess,
} from "../lib/output.js";
import { flavor } from "../lib/quotes.js";

const NEXT_STEPS = [
    'polli image "a sunset over kyoto" -o sunset.png',
    'polli text "summarize node http"',
    "polli whoami",
];

/**
 * Print the post-login "Try:" hint with example commands. Human/TTY only —
 * skipped for piped output and JSON callers so machine consumers stay clean.
 */
function printNextStepsHint(): void {
    if (getOutputMode() !== "human") return;
    if (!process.stderr.isTTY) return;
    process.stderr.write(`\n${chalk.bold("Try:")}\n`);
    for (const cmd of NEXT_STEPS) {
        process.stderr.write(`  ${chalk.cyan(cmd)}\n`);
    }
    process.stderr.write("\n");
}

type LoginOptions = {
    browser?: boolean;
    token?: string;
    withToken?: boolean;
};

interface ProfileResponse {
    githubUsername?: string | null;
    image?: string | null;
}

interface BalanceResponse {
    balance?: number;
}

interface KeyInfoResponse {
    valid?: boolean;
    type?: "publishable" | "secret";
    pollenBudget?: number | null;
    permissions?: {
        models?: string[] | null;
        account?: string[] | null;
    };
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
    storeKey(key);
    printSuccess("Authenticated. Key stored.");

    const label = await fetchProfileLabel(key);
    if (label) {
        printSuccess(label);
    } else {
        printInfo("Key stored but could not verify. It may still be valid.");
    }
    printInfo(flavor.login);
    printNextStepsHint();
}

async function fetchProfileLabel(key: string): Promise<string | null> {
    const profile = await gen<ProfileResponse>("/account/profile", {
        apiKey: key,
    }).catch(() => null);
    if (!profile) return null;
    return `Logged in as ${profile.githubUsername ?? "unknown"}`;
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

        printBanner("authenticate to start using the API");

        const res = await fetch(`${ENTER_URL}/api/device/code`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                client_id: "pk_NgBAArhUeGvSRFba",
                scope: "generate keys usage",
            }),
        }).catch((err) => {
            printError(
                `Failed to start device flow: ${err instanceof Error ? err.message : err}`,
            );
            printInfo(
                "Fallback: printf '%s' '<your-key>' | polli auth login --with-token",
            );
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
        const url = deviceResp.verification_uri_complete;

        // Two-block layout: URL first (the action the user needs to take),
        // then the code framed as a verification check (the security
        // purpose of device-flow codes — confirm the consent screen shows
        // the same code you see here, mitigating phishing). Polling line
        // gets its own block so it doesn't visually compete.
        if (getOutputMode() === "human") {
            const arrow = chalk.hex("#a78bfa")("➜");
            process.stderr.write(
                `  ${arrow} Open this URL to approve:\n    ${link(url)}\n\n`,
            );
            process.stderr.write(
                `  ${arrow} Confirm the code matches:  ${chalk.bold(deviceResp.user_code)}\n\n`,
            );
        }

        if (opts.browser !== false) {
            const open = (await import("open")).default;
            await open(url).catch(() =>
                printInfo("Could not open browser automatically."),
            );
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
        printNextStepsHint();
    });

const logout = new Command("logout")
    .description("Clear stored credentials")
    .action(() => {
        // Capture the masked key before clearing so the user sees which
        // identity they actually logged out of — handy when juggling
        // multiple accounts via env-var key overrides or shared machines.
        const previous = resolveApiKey();
        clearCredentials();

        if (getOutputMode() === "human" && process.stderr.isTTY) {
            const arrow = chalk.hex("#a78bfa")("✓");
            const path = chalk.dim(credentialsDisplayPath());
            const tail = previous
                ? ` (was ${chalk.dim(`${previous.slice(0, 5)}…${previous.slice(-4)}`)})`
                : "";
            process.stderr.write(`\n  ${arrow} Logged out${tail}\n`);
            process.stderr.write(`    Cleared ${path}\n\n`);
            process.stderr.write(`  ${chalk.dim(flavor.logout)}\n\n`);
            return;
        }
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

    const [profile, balance, keyInfo] = await Promise.all([
        gen<ProfileResponse>("/account/profile", { apiKey: key }).catch(
            () => null,
        ),
        gen<BalanceResponse>("/account/balance", { apiKey: key }).catch(
            () => null,
        ),
        gen<KeyInfoResponse>("/account/key", { apiKey: key }).catch(() => null),
    ]);

    if (!profile) {
        printResult({
            authenticated: true,
            key: masked,
            status: "Key stored but could not reach API",
        });
        return;
    }

    // /account/balance is overloaded server-side: it returns the *key's*
    // remaining budget when the key has one set (the device-flow CLI key
    // gets a default budget on mint), and only falls through to the user's
    // full account total when the key has no budget AND has the
    // `account:usage` scope. Surfacing that as "pollen" without context
    // misleads users — a fresh device-flow login shows e.g. 5 (the budget)
    // instead of their actual tier balance. Inspect /account/key to know
    // which value we're actually showing and label it honestly.
    const hasBudget = keyInfo?.pollenBudget != null;
    const pollenLabel = hasBudget ? "budget" : "pollen";

    printResult({
        authenticated: true,
        key: masked,
        name: profile.githubUsername ?? "unknown",
        [pollenLabel]: balance?.balance ?? "unknown",
        ...(hasBudget && {
            note: "shown is this key's remaining budget — not your account-wide pollen total",
        }),
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

export const whoamiCommand = new Command("whoami")
    .description(
        "Show current auth status and balance (alias for `auth status`)",
    )
    .action(showAuthStatus);
