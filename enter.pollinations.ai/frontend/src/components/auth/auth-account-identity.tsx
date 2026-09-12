import { AccountIdentity } from "@pollinations/ui";
import { formatPollen, WalletKindIcon } from "@pollinations/ui/wallet";
import type { User } from "../../auth.ts";

export function AuthAccountIdentity({
    user,
    balances,
}: {
    user: Pick<User, "name" | "email" | "image" | "githubUsername">;
    balances?: { paid: number; quest: number } | null;
}) {
    return (
        <div
            data-theme="neutral"
            className="polli:inline-flex polli:min-w-0 polli:max-w-full polli:rounded-full polli:bg-theme-bg-subtle polli:p-1 polli:pr-3"
        >
            <AccountIdentity
                name={user.githubUsername || user.name || user.email}
                avatarUrl={user.image}
                secondaryContent={
                    balances !== undefined ? (
                        <span className="inline-flex items-center gap-2 text-xs tabular-nums">
                            <span className="inline-flex items-center gap-1">
                                <WalletKindIcon kind="paid" />
                                <span className="sr-only">Paid Pollen: </span>
                                {balances === null
                                    ? "…"
                                    : formatPollen(Math.max(0, balances.paid))}
                            </span>
                            <span className="inline-flex items-center gap-1">
                                <WalletKindIcon kind="tier" />
                                <span className="sr-only">Quest Pollen: </span>
                                {balances === null
                                    ? "…"
                                    : formatPollen(Math.max(0, balances.quest))}
                            </span>
                        </span>
                    ) : undefined
                }
            />
        </div>
    );
}
