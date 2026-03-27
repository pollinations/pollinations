import { Command } from "commander";
import { enter, requireKey } from "../lib/api.js";
import { printError, printInfo, printResult, printTable } from "../lib/output.js";

interface KeyInfoResponse {
	valid: boolean;
	type: string;
	name: string | null;
	expiresAt: string | null;
	permissions: {
		models?: string[] | null;
		account?: string[] | null;
	} | null;
	pollenBudget: number | null;
	rateLimitEnabled: boolean;
}

const list = new Command("list")
	.description("List your API keys")
	.action(async () => {
		const key = requireKey();

		try {
			const keyInfo = await enter<KeyInfoResponse>("/api/account/key", {
				apiKey: key,
			});

			const masked = `${key.slice(0, 5)}...${key.slice(-6)}`;
			printTable([
				{
					key: masked,
					type: keyInfo.type ?? "unknown",
					name: keyInfo.name ?? "-",
					expires: keyInfo.expiresAt ?? "never",
					budget: keyInfo.pollenBudget ?? "unlimited",
					rate_limited: keyInfo.rateLimitEnabled ? "yes" : "no",
				},
			]);

			printInfo(
				"\nShowing current key only. Full key list requires session auth (device flow).",
			);
		} catch (err) {
			printError(
				`Failed to fetch keys: ${err instanceof Error ? err.message : "unknown"}`,
			);
			process.exit(1);
		}
	});

const info = new Command("info")
	.description("Show details about the current API key")
	.action(async () => {
		const key = requireKey();

		try {
			const keyInfo = await enter<KeyInfoResponse>("/api/account/key", {
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
					keyInfo.permissions?.models?.join(", ") ?? "none (all models)",
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
	.description("Create a new API key (requires device flow auth)")
	.option("--name <name>", "Key name")
	.option("--type <type>", "Key type: pk (publishable) or sk (secret)", "sk")
	.action(async () => {
		printInfo(
			"Key creation requires session auth via device flow (coming soon).",
		);
		printInfo("Create keys at: https://enter.pollinations.ai");
	});

const revoke = new Command("revoke")
	.description("Revoke an API key (requires device flow auth)")
	.argument("<id>", "Key ID to revoke")
	.action(async () => {
		printInfo(
			"Key revocation requires session auth via device flow (coming soon).",
		);
		printInfo("Manage keys at: https://enter.pollinations.ai");
	});

export const keysCommand = new Command("keys")
	.description("Manage API keys")
	.addCommand(list)
	.addCommand(info)
	.addCommand(create)
	.addCommand(revoke);
