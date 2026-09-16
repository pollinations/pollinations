import { AccountIdentity } from "@pollinations/ui";
import {
    AccountPollen,
    type AccountPollenSource,
} from "@pollinations/ui/wallet";
import type { User } from "../../auth.ts";

export type AuthAccountBalances = {
    paid: number;
    quest: number;
};

/** `balances` undefined = still loading, null = failed to load. */
export function AuthAccountIdentity({
    user,
    balances,
    requirement,
    topUpHref,
}: {
    user: Pick<User, "name" | "email" | "image" | "githubUsername">;
    balances?: AuthAccountBalances | null;
    requirement?: Extract<
        AccountPollenSource,
        { type: "wallet" }
    >["requirement"];
    /** Omit on the top-up page itself. */
    topUpHref?: string;
}) {
    return (
        <AccountIdentity
            name={user.name || user.githubUsername || user.email}
            avatarUrl={user.image}
            dashboardHref="/pollen"
            secondaryContent={
                balances !== undefined ? (
                    <AccountPollen
                        source={{ type: "wallet", balances, requirement }}
                        topUpHref={topUpHref}
                    />
                ) : undefined
            }
        />
    );
}
