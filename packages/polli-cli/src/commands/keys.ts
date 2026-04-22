import chalk from "chalk";
import { Command } from "commander";
import { enter, requireKey } from "../lib/api.js";
import {
    getOutputMode,
    printError,
    printInfo,
    printResult,
    printSuccess,
    printTable,
} from "../lib/output.js";

interface KeyInfo {
    id: string;
    name: string;
    start: string;
    prefix: string;
    createdAt: string;
    expiresAt: string | null;
    lastRequest: string | null;
    permissions: {
        tier?: string[];
        models?: string[];
        account?: string[];
    } | null;
    metadata: Record<string, unknown> | null;
    pollenBalance: number | null;
    enabled: boolean;
}

interface CreateKeyResponse {
    id: string;
    key: string;
    name: string;
    type: string;
    prefix: string;
    expiresAt: string | null;
    permissions: { models?: string[]; account?: string[] } | null;
    pollenBudget: number | null;
}

interface SingleKeyInfo {
    valid: boolean;
    type: string;
    name: string | null;
    expiresAt: string | null;
    permissions: { models?: string[]; account?: string[] } | null;
    pollenBudget: number | null;
    rateLimitEnabled: boolean;
}

const list = new Command("list")
    .description("List all API keys for your account")
    .option(
        "--verbose",
        "Show id, created, last_used, enabled columns (use --json for full raw data)",
    )
    .action(async (opts) => {
        const key = requireKey();

        try {
            const res = await enter<{ data: KeyInfo[] }>("/api/account/keys", {
                apiKey: key,
            });

            if (!res.data?.length) {
                printInfo("No API keys found.");
                return;
            }

            if (getOutputMode() === "json") {
                printResult(res.data);
                return;
            }

            const formatPerms = (p: KeyInfo["permissions"]) => {
                if (!p) return "-";
                const parts: string[] = [];
                for (const [key, v] of Object.entries(p)) {
                    if (!v?.length) continue;
                    parts.push(
                        v.length <= 2
                            ? `${key}:${v.join("|")}`
                            : `${key}:${v.length}`,
                    );
                }
                return parts.join(" ") || "-";
            };

            const check = process.platform === "win32" ? "yes" : "✓";
            const cross = process.platform === "win32" ? "no" : "✗";
            const rows = res.data.map((k) => ({
                id: chalk.dim(k.id.slice(0, 8)),
                name: k.name,
                prefix: chalk.dim(k.prefix),
                balance:
                    k.pollenBalance != null ? k.pollenBalance.toFixed(2) : "-",
                expires: k.expiresAt?.slice(0, 10) ?? "never",
                permissions: formatPerms(k.permissions),
                created: chalk.dim(k.createdAt?.slice(0, 10) ?? "-"),
                last_used: chalk.dim(k.lastRequest?.slice(0, 10) ?? "never"),
                enabled: k.enabled ? chalk.green(check) : chalk.red(cross),
            }));

            const cols = opts.verbose
                ? [
                      "id",
                      "name",
                      "prefix",
                      "balance",
                      "expires",
                      "permissions",
                      "created",
                      "last_used",
                      "enabled",
                  ]
                : ["name", "prefix", "balance", "expires", "permissions"];
            printTable(rows, cols);
        } catch (err) {
            printError(
                `Failed to list keys: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });

const info = new Command("info")
    .description(
        "Show details about the currently authenticated key (no args). To inspect another key by id, use `polli keys list --json`.",
    )
    .action(async () => {
        const key = requireKey();

        try {
            const keyInfo = await enter<SingleKeyInfo>("/api/account/key", {
                apiKey: key,
            });

            printResult({
                valid: keyInfo.valid,
                type: keyInfo.type,
                name: keyInfo.name ?? "-",
                expires: keyInfo.expiresAt ?? "never",
                budget: keyInfo.pollenBudget ?? "unlimited",
                rate_limited: keyInfo.rateLimitEnabled,
                model_restrictions:
                    keyInfo.permissions?.models?.join(", ") ??
                    "none (all models)",
                account_permissions:
                    keyInfo.permissions?.account?.join(", ") ?? "none",
            });
        } catch (err) {
            printError(
                `Failed to fetch key info: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });

const create = new Command("create")
    .description("Create a new API key")
    .requiredOption("--name <name>", "Key name")
    .option("--type <type>", "Key type: secret or publishable", "secret")
    .option("--expires-in <seconds>", "Expiry in seconds (max 365 days)")
    .option("--models <models...>", "Restrict to specific model IDs")
    .option("--budget <pollen>", "Pollen budget cap")
    .option(
        "--permissions <perms...>",
        'Account permissions (e.g. profile usage). "keys" is auto-stripped.',
    )
    .action(async (opts) => {
        const key = requireKey();

        try {
            const body: Record<string, unknown> = {
                name: opts.name,
                type: opts.type,
            };
            if (opts.expiresIn !== undefined)
                body.expiresIn = Number(opts.expiresIn);
            if (opts.models) body.allowedModels = opts.models;
            if (opts.budget !== undefined) {
                const budget = Number(opts.budget);
                if (!Number.isFinite(budget) || budget < 0) {
                    printError("--budget must be a non-negative number");
                    process.exit(1);
                }
                body.pollenBudget = budget;
            }
            if (opts.permissions) body.accountPermissions = opts.permissions;

            const created = await enter<CreateKeyResponse>(
                "/api/account/keys",
                {
                    apiKey: key,
                    method: "POST",
                    body,
                },
            );

            if (getOutputMode() === "human") {
                printSuccess(`Key created: ${created.name}`);
                printInfo("Save this key — it won't be shown again:\n");
                process.stdout.write(`  ${created.key}\n\n`);
            }

            printResult({
                id: created.id,
                key: created.key,
                name: created.name,
                type: created.type,
                prefix: created.prefix,
                expires: created.expiresAt ?? "never",
                permissions: created.permissions,
                budget: created.pollenBudget ?? "unlimited",
            });
        } catch (err) {
            printError(
                `Failed to create key: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });

const revoke = new Command("revoke")
    .description("Revoke an API key by ID")
    .argument("<id>", "Key ID to revoke")
    .action(async (id) => {
        const key = requireKey();

        try {
            await enter<{ success: boolean }>(`/api/account/keys/${id}`, {
                apiKey: key,
                method: "DELETE",
            });

            printSuccess(`Key ${id} revoked.`);
        } catch (err) {
            printError(
                `Failed to revoke key: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });

export const keysCommand = new Command("keys")
    .description("Manage API keys (create, list, revoke)")
    .addCommand(list)
    .addCommand(info)
    .addCommand(create)
    .addCommand(revoke);
