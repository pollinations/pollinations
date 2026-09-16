import {
    useAccountBalance,
    useAccountKey,
    useAccountProfile,
    useAuthActions,
    useAuthState,
} from "@pollinations/sdk/react";
import markUrl from "../../brand/mark.svg";
import { AccountMenu } from "../../compositions/AccountMenu.tsx";
import { DropdownItem } from "../../primitives/DropdownItem.tsx";
import {
    ExternalLinkIcon,
    KeyIcon,
    PowerIcon,
    WalletIcon,
} from "../../primitives/icons/index.tsx";
import { LoginButton } from "../auth/sdk.ts";
import { AccountPollen } from "../wallet/AccountPollen.tsx";

export type AppUserMenuLabels = {
    authorize: string;
    appUserMenu: string;
    permissions: string;
    buyPollen: string;
    logout: string;
};

export type AppUserMenuProps = {
    /** Optional caller-owned dashboard destination for the linked avatar. */
    dashboardHref?: string;
    labels?: Partial<AppUserMenuLabels>;
};

const defaultLabels: AppUserMenuLabels = {
    authorize: "Connect with Pollinations",
    appUserMenu: "App user menu",
    permissions: "Permissions",
    buyPollen: "Buy Pollen",
    logout: "Disconnect",
};

export function AppUserMenu({
    dashboardHref,
    labels: labelOverrides,
}: AppUserMenuProps) {
    const labels = { ...defaultLabels, ...labelOverrides };
    const { logout, enterUrl } = useAuthActions();
    const { isLoggedIn } = useAuthState();
    const profile = useAccountProfile({ enabled: isLoggedIn });
    const key = useAccountKey({ enabled: isLoggedIn });
    // Only keys with the usage scope may read the wallet; skip the request otherwise.
    const canReadWallet =
        key.data?.permissions?.account?.includes("usage") ?? false;
    const wallet = useAccountBalance({ enabled: isLoggedIn && canReadWallet })
        .data?.accountBalance;
    const returnUrl =
        typeof window === "undefined"
            ? undefined
            : new URL(window.location.pathname, window.location.origin).href;
    const topUpUrl = new URL("/top-up", enterUrl);
    if (returnUrl) topUpUrl.searchParams.set("redirect", returnUrl);
    const keyId = key.data?.id;
    let editKeyUrl: URL | undefined;
    if (keyId) {
        editKeyUrl = new URL("/edit-key", enterUrl);
        editKeyUrl.searchParams.set("id", keyId);
        if (returnUrl) editKeyUrl.searchParams.set("redirect", returnUrl);
    }

    return (
        <div
            data-theme="accent"
            className="polli:flex polli:shrink-0 polli:justify-end"
        >
            {!isLoggedIn ? (
                <LoginButton className="polli:gap-1.5 polli:whitespace-nowrap">
                    <span
                        aria-hidden="true"
                        className="polli:block polli:h-4 polli:w-4 polli:shrink-0 polli:bg-current"
                        style={{
                            mask: `url('${markUrl}') center / contain no-repeat`,
                            WebkitMask: `url('${markUrl}') center / contain no-repeat`,
                        }}
                    />
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
                    dashboardHref={
                        dashboardHref ?? new URL("/pollen", enterUrl).href
                    }
                    menuLabel={labels.appUserMenu}
                    className="polli:max-w-80"
                    secondaryContent={
                        key.data ? (
                            <span className="polli:inline-flex polli:items-center polli:gap-2">
                                <AccountPollen
                                    source={{
                                        type: "budget",
                                        remaining: key.data.pollenBudget,
                                        generationEnabled:
                                            key.data.permissions?.models
                                                ?.length !== 0,
                                    }}
                                />
                                {wallet && (
                                    <AccountPollen
                                        source={{
                                            type: "wallet",
                                            balances: {
                                                paid: wallet.paid,
                                                quest: wallet.tier,
                                            },
                                        }}
                                    />
                                )}
                            </span>
                        ) : undefined
                    }
                >
                    {(close) => (
                        <>
                            {editKeyUrl && (
                                <DropdownItem
                                    as="a"
                                    href={editKeyUrl.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={close}
                                >
                                    <KeyIcon
                                        className="polli:h-4 polli:w-4 polli:shrink-0"
                                        aria-hidden="true"
                                    />
                                    {labels.permissions}
                                    <ExternalLinkIcon
                                        className="polli:ml-auto polli:h-3.5 polli:w-3.5 polli:shrink-0"
                                        aria-hidden="true"
                                    />
                                </DropdownItem>
                            )}
                            <DropdownItem
                                as="a"
                                href={topUpUrl.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={close}
                            >
                                <WalletIcon
                                    className="polli:h-4 polli:w-4 polli:shrink-0"
                                    aria-hidden="true"
                                />
                                {labels.buyPollen}
                                <ExternalLinkIcon
                                    className="polli:ml-auto polli:h-3.5 polli:w-3.5 polli:shrink-0"
                                    aria-hidden="true"
                                />
                            </DropdownItem>
                            <DropdownItem
                                type="button"
                                className="polli:justify-start polli:text-left"
                                onClick={() => {
                                    close();
                                    logout();
                                }}
                            >
                                <PowerIcon
                                    className="polli:h-4 polli:w-4 polli:shrink-0"
                                    aria-hidden="true"
                                />
                                {labels.logout}
                            </DropdownItem>
                        </>
                    )}
                </AccountMenu>
            )}
        </div>
    );
}
