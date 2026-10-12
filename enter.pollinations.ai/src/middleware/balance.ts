import {
    getAvailableBalance,
    type UserBalance,
} from "@shared/billing/balance.ts";
import { getFundedUserBalance } from "@shared/billing/internal-automation.ts";
import { drizzle } from "drizzle-orm/d1";
import { createMiddleware } from "hono/factory";
import type { AuthVariables } from "./auth.ts";
import type { LoggerVariables } from "./logger.ts";

export { getAvailableBalance };
export type { UserBalance };

export type BalanceVariables = {
    balance: {
        getBalance: (userId: string) => Promise<UserBalance>;
    };
};

export type BalanceEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & AuthVariables & BalanceVariables;
};

export const balance = createMiddleware<BalanceEnv>(async (c, next) => {
    const db = drizzle(c.env.DB);

    c.set("balance", {
        getBalance: (userId: string) =>
            getFundedUserBalance(db, c.env.DB, userId),
    });

    await next();
});
