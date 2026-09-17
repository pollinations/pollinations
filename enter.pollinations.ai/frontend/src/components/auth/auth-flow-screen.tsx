import { ColorModeToggle } from "@pollinations/ui";
import { AuthFlowLayout } from "@pollinations/ui/auth";
import type { ComponentProps } from "react";
import { authClient } from "../../auth.ts";
import {
    type AccountBalance,
    useAccountBalance,
} from "../../hooks/use-account-balance.ts";
import { AuthAccountIdentity } from "./auth-account-identity.tsx";

type AuthFlowScreenProps = Omit<
    ComponentProps<typeof AuthFlowLayout>,
    "headerAction"
> & {
    /** Wallet the screen already loads; skips the shared balance request. */
    balance?: AccountBalance | null;
    /** Identity top-up link. Defaults to returning here; `null` on the top-up page. */
    topUpHref?: string | null;
};

function returnToTopUpHref(): string {
    return typeof window === "undefined"
        ? "/top-up"
        : `/top-up?${new URLSearchParams({ redirect: window.location.href })}`;
}

/** Enter auth-flow screen: a signed-in user always sees their identity and balances. */
export function AuthFlowScreen({
    balance,
    topUpHref,
    ...props
}: AuthFlowScreenProps) {
    const { data: session } = authClient.useSession();
    const user = session?.user;
    const fetchedBalance = useAccountBalance(
        Boolean(user) && balance === undefined,
    );
    return (
        <AuthFlowLayout
            {...props}
            headerAction={
                user ? (
                    <AuthAccountIdentity
                        user={user}
                        balance={balance ?? fetchedBalance}
                        topUpHref={
                            topUpHref === null
                                ? undefined
                                : (topUpHref ?? returnToTopUpHref())
                        }
                    />
                ) : (
                    <ColorModeToggle />
                )
            }
        />
    );
}
