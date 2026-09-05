import {
    useAccountBalance,
    useAccountKey,
    useAccountProfile,
    useAuthActions,
    useAuthState,
} from "@pollinations/sdk/react";
import { AccountMenu } from "../../compositions/AccountMenu.tsx";
import { DropdownItem } from "../../primitives/DropdownItem.tsx";
import { LockIcon, SignOutIcon } from "../../primitives/icons/index.tsx";
import { LoginButton } from "../auth/sdk.ts";
import { formatPollen } from "../wallet/format-pollen.ts";

export type AppUserMenuLabels = {
    authorize: string;
    appUserMenu: string;
    topUpAccount: string;
    logout: string;
    appAllowance: string;
    accountBalance: string;
    detailsUnavailable: string;
};

export type AppUserMenuProps = {
    dashboardHref: string;
    labels?: Partial<AppUserMenuLabels>;
};

const defaultLabels: AppUserMenuLabels = {
    authorize: "Connect",
    appUserMenu: "Connected app account menu",
    topUpAccount: "Manage account / buy Pollen",
    logout: "Log out from this app",
    appAllowance: "App allowance",
    accountBalance: "Account balance",
    detailsUnavailable: "Connection details unavailable",
};

/** Delegated API access. Logging out forgets this app's key; it does not revoke it. */
export function AppUserMenu({
    dashboardHref,
    labels: labelOverrides,
}: AppUserMenuProps) {
    const labels = { ...defaultLabels, ...labelOverrides };
    const { logout } = useAuthActions();
    const { isLoggedIn, isHydrated } = useAuthState();
    const profile = useAccountProfile({ enabled: isLoggedIn });
    const balance = useAccountBalance({ enabled: isLoggedIn });
    const key = useAccountKey({ enabled: isLoggedIn });
    const balanceLabel =
        key.data?.pollenBudget != null
            ? labels.appAllowance
            : labels.accountBalance;

    return (
        <div
            data-theme="accent"
            className="polli:flex polli:shrink-0 polli:justify-end"
        >
            {!isLoggedIn ? (
                <LoginButton
                    disabled={!isHydrated}
                    className="polli:gap-1.5 polli:whitespace-nowrap"
                >
                    <LockIcon className="polli:h-4 polli:w-4 polli:shrink-0" />
                    {labels.authorize}
                </LoginButton>
            ) : (
                <AccountMenu
                    name={
                        profile.data?.name ||
                        profile.data?.githubUsername ||
                        "Connected user"
                    }
                    avatarUrl={profile.data?.image}
                    menuLabel={labels.appUserMenu}
                    className="polli:max-w-64"
                    menuClassName="polli:w-64"
                    secondaryContent={
                        key.error || balance.error
                            ? labels.detailsUnavailable
                            : balance.data && key.data
                              ? `${balanceLabel}: ${formatPollen(balance.data.balance)} Pollen`
                              : undefined
                    }
                >
                    {(close) => (
                        <>
                            <DropdownItem
                                as="a"
                                href={dashboardHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={close}
                            >
                                {labels.topUpAccount}
                            </DropdownItem>
                            <p className="polli:px-3 polli:py-2 polli:text-xs polli:text-theme-text-muted">
                                Buying Pollen funds your wallet. Manage this
                                app's allowance and authorization in Enter.
                            </p>
                            <DropdownItem
                                onClick={() => {
                                    close();
                                    logout();
                                }}
                            >
                                <SignOutIcon className="polli:h-4 polli:w-4 polli:shrink-0" />
                                {labels.logout}
                            </DropdownItem>
                        </>
                    )}
                </AccountMenu>
            )}
        </div>
    );
}
