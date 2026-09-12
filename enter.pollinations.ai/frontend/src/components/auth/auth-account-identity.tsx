import { AccountIdentity } from "@pollinations/ui";
import {
    AccountPollen,
    type AccountPollenSource,
} from "@pollinations/ui/wallet";
import type { User } from "../../auth.ts";

export function AuthAccountIdentity({
    user,
    balances,
    requirement,
}: {
    user: Pick<User, "name" | "email" | "image" | "githubUsername">;
    balances?: { paid: number; quest: number } | null;
    requirement?: Extract<
        AccountPollenSource,
        { type: "wallet" }
    >["requirement"];
}) {
    return (
        <div
            data-theme="neutral"
            className="polli:inline-flex polli:min-w-0 polli:max-w-full polli:rounded-full polli:bg-theme-bg-subtle polli:p-1 polli:pr-3"
        >
            <AccountIdentity
                name={user.githubUsername || user.name || user.email}
                avatarUrl={user.image}
                dashboardHref="/pollen"
                secondaryContent={
                    balances !== undefined ? (
                        <AccountPollen
                            source={{ type: "wallet", balances, requirement }}
                            topUpHref="/top-up"
                        />
                    ) : undefined
                }
            />
        </div>
    );
}
