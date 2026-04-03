import { Command } from "commander";
import { enter, requireKey } from "../lib/api.js";
import { printError, printResult } from "../lib/output.js";

interface ProfileResponse {
    name?: string;
    email?: string;
    tier?: string;
    createdAt?: string;
}

interface BalanceResponse {
    balance?: number;
}

export const whoamiCommand = new Command("whoami")
    .description("Show current identity and tier")
    .action(async () => {
        const key = requireKey();

        try {
            const [profile, balance] = await Promise.all([
                enter<ProfileResponse>("/api/account/profile", { apiKey: key }),
                enter<BalanceResponse>("/api/account/balance", {
                    apiKey: key,
                }).catch(() => null),
            ]);

            printResult({
                name: profile.name ?? profile.email ?? "unknown",
                tier: profile.tier ?? "unknown",
                pollen: balance?.balance ?? "unknown",
                member_since: profile.createdAt ?? "unknown",
            });
        } catch (err) {
            printError(
                `Failed to fetch profile: ${err instanceof Error ? err.message : "unknown error"}`,
            );
            process.exit(1);
        }
    });
