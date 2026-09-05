import {
    useAccountProfile,
    useAuthActions,
    useAuthState,
} from "@pollinations/sdk/react";
import { AccountMenu } from "../../compositions/AccountMenu.tsx";
import { DropdownItem } from "../../primitives/DropdownItem.tsx";
import { LockIcon, SignOutIcon } from "../../primitives/icons/index.tsx";
import { LoginButton } from "../auth/sdk.ts";
import { Balance } from "../wallet/sdk.ts";

export type AppUserMenuLabels = {
    authorize: string;
    appUserMenu: string;
    topUpAccount: string;
    logout: string;
};

export type AppUserMenuProps = {
    dashboardHref: string;
    labels?: Partial<AppUserMenuLabels>;
};

const defaultLabels: AppUserMenuLabels = {
    authorize: "Connect",
    appUserMenu: "App user menu",
    topUpAccount: "Top up account",
    logout: "Log out from this app",
};

/** Delegated API access. Logging out forgets this app's key; it does not revoke it. */
export function AppUserMenu({
    dashboardHref,
    labels: labelOverrides,
}: AppUserMenuProps) {
    const labels = { ...defaultLabels, ...labelOverrides };
    const { logout } = useAuthActions();
    const { isLoggedIn } = useAuthState();
    const profile = useAccountProfile({ enabled: isLoggedIn });

    return (
        <div
            data-theme="accent"
            className="polli:flex polli:shrink-0 polli:justify-end"
        >
            {!isLoggedIn ? (
                <LoginButton className="polli:gap-1.5 polli:whitespace-nowrap">
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
                        <Balance className="polli:bg-transparent polli:px-0 polli:py-0 polli:text-xs polli:text-theme-text-base" />
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
