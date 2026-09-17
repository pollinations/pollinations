import { ColorModeToggle, InlineLink } from "@pollinations/ui";
import { AuthFlowLayout } from "@pollinations/ui/auth";
import type { ComponentProps } from "react";
import { authClient } from "../../auth.ts";
import {
    type AccountBalance,
    useAccountBalance,
} from "../../hooks/use-account-balance.ts";
import { AuthAccountIdentity } from "./auth-account-identity.tsx";

const footnotes = {
    dashboard: (
        <>
            Manage your account on the{" "}
            <InlineLink href="/">dashboard</InlineLink>.
        </>
    ),
    back: (
        <>
            <InlineLink href="/">Back to the dashboard</InlineLink>.
        </>
    ),
    help: (
        <>
            Need help? Contact{" "}
            <InlineLink href="mailto:hello@pollinations.ai">
                hello@pollinations.ai
            </InlineLink>
            .
        </>
    ),
    billing: (
        <>
            Need help? Contact{" "}
            <InlineLink href="mailto:billing@pollinations.ai">
                billing@pollinations.ai
            </InlineLink>
            .
        </>
    ),
};

type AuthFlowScreenProps = Omit<
    ComponentProps<typeof AuthFlowLayout>,
    "headerAction" | "footnote"
> & {
    /** Results say "back", errors say "help"; otherwise legal when signed out, dashboard when signed in. */
    footnote?: keyof typeof footnotes;
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
    footnote,
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
            footnote={
                footnote
                    ? footnotes[footnote]
                    : user
                      ? footnotes.dashboard
                      : undefined
            }
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
