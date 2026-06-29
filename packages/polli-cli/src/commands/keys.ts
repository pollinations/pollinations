import chalk from "chalk";
import { Command } from "commander";
import { gen, requireKey } from "../lib/api.js";
import {
    getOutputMode,
    printError,
    printInfo,
    printResult,
    printSuccess,
    printTable,
} from "../lib/output.js";
import { t } from "../lib/i18n.js";
import { logActivity } from "../lib/logger.js";
import {
    KeyInfoSchema,
    KeysListResponseSchema,
    CreateKeyResponseSchema,
    SingleKeyInfoSchema,
} from "../lib/validation.js";

const list = new Command("list")
    .description("List all API keys for your account")
    .option(
        "--verbose",
        "Show id, created, last_used, enabled columns (use --json for full raw data)",
    )
    .action(async (opts) => {
        const key = await requireKey();
        try {
            const res = await gen<{ data: unknown[] }>("/account/keys", {
                apiKey: key,
            });
            const validated = KeysListResponseSchema.safeParse(res);
            if (!validated.success) {
                printError(`Invalid response: ${validated.error.message}`);
                process.exit(1);
            }
            const data = validated.data.data;
            if (!data?.length) {
                printInfo("No API keys found.");
                return;
            }

            if (getOutputMode() !== "human") {
                printResult(data);
                return;
            }

            const formatPerms = (p: KeyInfoSchema["permissions"]) => {
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

            const rows = data.map((k) => ({
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
            logActivity("keys_list", { verbose: opts.verbose });
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
        const key = await requireKey();
        try {
            const keyInfo = await gen<unknown>("/account/key", {
                apiKey: key,
            });
            const validated = SingleKeyInfoSchema.safeParse(keyInfo);
            if (!validated.success) {
                printError(`Invalid response: ${validated.error.message}`);
                process.exit(1);
            }
            const info = validated.data;
            printResult({
                valid: info.valid,
                type: info.type,
                name: info.name ?? "-",
                expires: info.expiresAt ?? "never",
                budget: info.pollenBudget ?? "unlimited",
                rate_limited: info.rateLimitEnabled,
                model_restrictions:
                    info.permissions?.models?.join(", ") ??
                    "none (all models)",
                account_permissions:
                    info.permissions?.account?.join(", ") ?? "none",
            });
        } catch (err) {
            printError(
                `Failed to fetch key info: ${err instanceof Error ? err.message : "unknown"}`,
            );
            process.exit(1);
        }
    });

const create = new Command("create")
    .description(
        "Create a new API key. Use --type publishable to create an app key.",
    )
    .requiredOption("--name <name>", "Key name")
    .option(
        "--type <type>",
        "Key type: secret or publishable app key",
        "secret",
    )
    .option("--expires-in <seconds>", "Expiry in seconds (max 365 days)")
    .option("--models <models...>", "Restrict to specific model IDs")
    .option("--budget <pollen>", "Pollen budget cap")
    .option(
        "--redirect-uri <uri...>",
        "Allowed BYOP redirect URI(s) for publishable app keys",
    )
    .option("--earnings", "Enable developer earnings for publishable app keys")
    .option(
        "--permissions <perms...>",
        'Account permissions (e.g. profile usage). "keys" is auto-stripped.',
    )
    .addHelpText(
        "after",
        `
Examples:
  polli keys create --name my-bot --type secret
  polli keys create --name my-app --type publishable --redirect-uri https://myapp.com/callback
  polli keys create --name my-app --type publishable --redirect-uri https://myapp.com/callback --earnings
`,
    )
    .action(async (opts) => {
        const key = await requireKey();
        try {
            const body: Record<string, unknown> = {
                name: opts.name,
                type: opts.type,
            };
            if (opts.redirectUri && opts.type !== "publishable") {
                printError("--redirect-uri requires --type publishable");
                process.exit(1);
            }
            if (opts.earnings === true && opts.type !== "publishable") {
                printError("--earnings requires --type publishable");
                process.exit(1);
            }
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
            if (opts.redirectUri) body.redirectUris = opts.redirectUri;
            if (opts.earnings === true) body.earningsEnabled = true;

            const created = await gen<unknown>("/account/keys", {
                apiKey: key,
                method: "POST",
                body,
            });
            const validated = CreateKeyResponseSchema.safeParse(created);
            if (!validated.success) {
                printError(`Invalid response: ${validated.error.message}`);
                process.exit(1);
            }
            const data = validated.data;

            if (getOutputMode() === "human") {
                printSuccess(`Key created: ${data.name}`);
                printInfo("Save this key — it won't be shown again:\n");
                process.stdout.write(`  ${data.key}\n\n`);
            }
            printResult({
                id: data.id,
                key: data.key,
                name: data.name,
                type: data.type,
                prefix: data.prefix,
                expires: data.expiresAt ?? "never",
                permissions: data.permissions,
                budget: data.pollenBudget ?? "unlimited",
                redirectUris: data.metadata?.redirectUris,
                earnings: data.metadata?.earningsEnabled,
            });
            logActivity("key_create", { name: opts.name, type: opts.type });
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
        const key = await requireKey();
        try {
            await gen<{ success: boolean }>(`/account/keys/${id}`, {
                apiKey: key,
                method: "DELETE",
            });
            printSuccess(`Key ${id} revoked.`);
            logActivity("key_revoke", { id });
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