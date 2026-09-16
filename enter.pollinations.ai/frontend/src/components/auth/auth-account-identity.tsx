import { AccountIdentity } from "@pollinations/ui";
import { AccountPollen } from "@pollinations/ui/wallet";
import type { User } from "../../auth.ts";

export type AuthAccountBalances = {
    paid: number;
    quest: number;
};

/** `balances` undefined = still loading, null = failed to load. */
export function AuthAccountIdentity({
    user,
    balances,
    topUpHref,
}: {
    user: Pick<User, "name" | "email" | "image" | "githubUsername">;
    balances?: AuthAccountBalances | null;
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
                        source={{ type: "wallet", balances }}
                        topUpHref={topUpHref}
                    />
                ) : undefined
            }
        />
    );
}
