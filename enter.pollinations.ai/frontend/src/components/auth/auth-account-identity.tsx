import { AccountIdentity } from "@pollinations/ui";
import { AccountPollen } from "@pollinations/ui/wallet";
import type { User } from "../../auth.ts";
import type { AccountBalance } from "../../hooks/use-account-balance.ts";

export function AuthAccountIdentity({
    user,
    balance,
    topUpHref,
}: {
    user: Pick<User, "name" | "email" | "image" | "githubUsername">;
    balance?: AccountBalance;
    /** Omit on the top-up page itself. */
    topUpHref?: string;
}) {
    return (
        <AccountIdentity
            name={user.name || user.githubUsername || user.email}
            avatarUrl={user.image}
            dashboardHref="/pollen"
            className="polli:bg-transparent"
            secondaryContent={
                balance ? (
                    <AccountPollen
                        source={{
                            type: "wallet",
                            balances: {
                                paid: balance.packBalance,
                                quest: balance.tierBalance,
                            },
                        }}
                        topUpHref={topUpHref}
                    />
                ) : undefined
            }
        />
    );
}
