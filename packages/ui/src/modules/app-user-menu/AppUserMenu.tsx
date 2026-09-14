import {
    useAccountProfile,
    useAuthActions,
    useAuthState,
} from "@pollinations/sdk/react";
import { AccountMenu } from "../../compositions/AccountMenu.tsx";
import { DropdownItem } from "../../primitives/DropdownItem.tsx";
import {
    ExternalLinkIcon,
    LockIcon,
    SignOutIcon,
    SproutIcon,
    WalletIcon,
} from "../../primitives/icons/index.tsx";
import { LoginButton } from "../auth/sdk.ts";
import { Balance } from "../wallet/sdk.ts";

export type AppUserMenuLabels = {
    authorize: string;
    appUserMenu: string;
    getFreePollen: string;
    topUpAccount: string;
    logout: string;
};

export type AppUserMenuProps = {
    labels?: Partial<AppUserMenuLabels>;
};

const defaultLabels: AppUserMenuLabels = {
    authorize: "Connect Pollen",
    appUserMenu: "App user menu",
    getFreePollen: "Get free Pollen",
    topUpAccount: "Buy Pollen",
    logout: "Disconnect",
};

/** Delegated API access. Logging out forgets this app's key; it does not revoke it. */
export function AppUserMenu({ labels: labelOverrides }: AppUserMenuProps) {
    const labels = { ...defaultLabels, ...labelOverrides };
    const { logout, enterUrl } = useAuthActions();
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
                    menuClassName="polli:w-max polli:min-w-0"
                    secondaryContent={
                        <Balance className="polli:bg-transparent polli:px-0 polli:py-0 polli:text-xs polli:text-theme-text-base" />
                    }
                >
                    {(close) => (
                        <>
                            <DropdownItem
                                as="a"
                                href={new URL("/quests", enterUrl).href}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={close}
                            >
                                <SproutIcon
                                    className="polli:h-4 polli:w-4 polli:shrink-0"
                                    aria-hidden="true"
                                />
                                {labels.getFreePollen}
                                <ExternalLinkIcon
                                    className="polli:ml-auto polli:h-3.5 polli:w-3.5 polli:shrink-0"
                                    aria-hidden="true"
                                />
                            </DropdownItem>
                            <DropdownItem
                                as="a"
                                href={new URL("/pollen", enterUrl).href}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={close}
                            >
                                <WalletIcon
                                    className="polli:h-4 polli:w-4 polli:shrink-0"
                                    aria-hidden="true"
                                />
                                {labels.topUpAccount}
                                <ExternalLinkIcon
                                    className="polli:ml-auto polli:h-3.5 polli:w-3.5 polli:shrink-0"
                                    aria-hidden="true"
                                />
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
