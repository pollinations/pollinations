import { Polar } from "@polar-sh/sdk";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { user as userTable } from "@/db/schema/better-auth.ts";
import type { AuthVariables } from "@/middleware/auth.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";

type BalanceCheckResult = {
    selectedMeterId: string;
    selectedMeterSlug: string;
    meters: SimplifiedMeter[];
};

export type PolarVariables = {
    polar: {
        client: Polar; // Kept for checkout fallback only
        requirePositiveBalance: (
            userId: string,
            message?: string,
        ) => Promise<void>;
        getBalance: (userId: string) => Promise<{
            tierBalance: number;
            packBalance: number;
            cryptoBalance: number;
        }>;
        balanceCheckResult?: BalanceCheckResult;
    };
};

export type PolarEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & AuthVariables & PolarVariables;
};

export const polar = createMiddleware<PolarEnv>(async (c, next) => {
    const log = c.get("log").getChild("balance");

    // Polar client kept only for checkout fallback
    const client = new Polar({
        accessToken: c.env.POLAR_ACCESS_TOKEN,
        server: c.env.POLAR_SERVER,
    });

    // Get balance from D1 only - no Polar API calls
    // Pack balance is updated via webhooks, tier balance via daily cron
    const getBalance = async (
        userId: string,
    ): Promise<{
        tierBalance: number;
        packBalance: number;
        cryptoBalance: number;
    }> => {
        const db = drizzle(c.env.DB);
        const users = await db
            .select({
                tierBalance: userTable.tierBalance,
                packBalance: userTable.packBalance,
                cryptoBalance: userTable.cryptoBalance,
            })
            .from(userTable)
            .where(eq(userTable.id, userId))
            .limit(1);

        return {
            tierBalance: users[0]?.tierBalance ?? 0,
            packBalance: users[0]?.packBalance ?? 0,
            cryptoBalance: users[0]?.cryptoBalance ?? 0,
        };
    };

    const requirePositiveBalance = async (userId: string, message?: string) => {
        let balances: {
            tierBalance: number;
            packBalance: number;
            cryptoBalance: number;
        };
        try {
            balances = await getBalance(userId);
        } catch (error) {
            log.error("Failed to get balance for user {userId}", {
                userId,
                error: error instanceof Error ? error.message : String(error),
            });
            throw new HTTPException(503, {
                message: "Unable to verify balance. Please try again shortly.",
            });
        }

        const totalBalance =
            balances.tierBalance +
            balances.packBalance +
            balances.cryptoBalance;

        log.debug(
            "Local pollen balance for user {userId}: tier={tierBalance}, pack={packBalance}, crypto={cryptoBalance}, total={totalBalance}",
            {
                userId,
                tierBalance: balances.tierBalance,
                packBalance: balances.packBalance,
                cryptoBalance: balances.cryptoBalance,
                totalBalance,
            },
        );

        if (totalBalance > 0) {
            // Set balance result for tracking - tier is used first, then pack
            const willUseTier = balances.tierBalance > 0;
            c.var.polar.balanceCheckResult = {
                selectedMeterId: willUseTier ? "local:tier" : "local:pack",
                selectedMeterSlug: willUseTier
                    ? "v1:meter:tier"
                    : "v1:meter:pack",
                meters: [
                    {
                        meterId: "local:tier",
                        balance: balances.tierBalance,
                        metadata: { slug: "local:tier", priority: 0 },
                    },
                    {
                        meterId: "local:pack",
                        balance: balances.packBalance,
                        metadata: { slug: "local:pack", priority: 1 },
                    },
                ],
            };
            return;
        }

        // no positive balance - 402 for all billing/payment issues
        throw new HTTPException(402, {
            message: message || "Your pollen balance is too low.",
        });
    };

    c.set("polar", {
        client, // Kept for checkout fallback only
        requirePositiveBalance,
        getBalance,
    });

    await next();
});

type SimplifiedMeter = {
    meterId: string;
    balance: number;
    metadata: { slug: string; priority: number };
};
