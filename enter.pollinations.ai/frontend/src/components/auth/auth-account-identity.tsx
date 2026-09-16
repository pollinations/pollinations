import { AccountIdentity } from "@pollinations/ui";
import { formatPollen, WalletKindIcon } from "@pollinations/ui/wallet";
import type { User } from "../../auth.ts";

export type AuthAccountBalances = {
    paid: number;
    quest: number;
};

export function AuthAccountIdentity({
    user,
    balances,
}: {
    user: Pick<User, "name" | "email" | "image" | "githubUsername">;
    balances?: AuthAccountBalances | null;
}) {
    return (
        <AccountIdentity
            name={user.githubUsername || user.name || user.email}
            avatarUrl={user.image}
            dashboardHref="/pollen"
            secondaryContent={
                balances ? (
                    <span className="polli:flex polli:items-center polli:gap-2 polli:tabular-nums">
                        <span className="polli:inline-flex polli:items-center polli:gap-1">
                            <WalletKindIcon kind="paid" />
                            <span className="polli:sr-only">Paid Pollen:</span>
                            {formatPollen(balances.paid)}
                        </span>
                        <span className="polli:inline-flex polli:items-center polli:gap-1">
                            <WalletKindIcon kind="tier" />
                            <span className="polli:sr-only">Quest Pollen:</span>
                            {formatPollen(balances.quest)}
                        </span>
                    </span>
                ) : undefined
            }
        />
    );
}
