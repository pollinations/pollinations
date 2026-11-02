import { AccountIdentity } from "@pollinations/ui";
import { AccountPollen } from "@pollinations/ui/wallet";
import type { User } from "../../auth.ts";
import {
    type AccountBalance,
    BALANCE_PATH,
} from "../../hooks/use-account-balance.ts";
import { useOutage } from "../../lib/outage.ts";

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
    const outage = useOutage([BALANCE_PATH]);
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
                                quest: balance.questPollenRestricted
                                    ? 0
                                    : balance.tierBalance,
                            },
                        }}
                        topUpHref={topUpHref}
                    />
                ) : outage ? (
                    <AccountPollen source={{ type: "unavailable" }} />
                ) : undefined
            }
        />
    );
}
