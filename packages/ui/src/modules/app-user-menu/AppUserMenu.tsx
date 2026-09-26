import {
    useAccountBalance,
    useAccountKey,
    useAccountProfile,
    useAuthActions,
    useAuthState,
} from "@pollinations/sdk/react";
import { useEffect } from "react";
import markUrl from "../../brand/mark.svg";
import { AccountMenu } from "../../compositions/AccountMenu.tsx";
import { cn } from "../../lib/cn.ts";
import { DropdownItem } from "../../primitives/DropdownItem.tsx";
import {
    ExternalLinkIcon,
    KeyIcon,
    PowerIcon,
    WalletIcon,
} from "../../primitives/icons/index.tsx";
import { LoginButton } from "../auth/sdk.ts";
import {
    AccountPollen,
    type AccountPollenSource,
} from "../wallet/AccountPollen.tsx";

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
    /** Larger logged-out action for prominent placements such as a page hero. */
    connectSize?: "md" | "lg";
    labels?: Partial<AppUserMenuLabels>;
};

const defaultLabels: AppUserMenuLabels = {
    authorize: "Pollinations Connect",
    appUserMenu: "App user menu",
    permissions: "Permissions",
    buyPollen: "Buy Pollen",
    logout: "Disconnect",
};

export function AppUserMenu({
    dashboardHref,
    connectSize = "md",
    labels: labelOverrides,
}: AppUserMenuProps) {
    const labels = { ...defaultLabels, ...labelOverrides };
    const { logout, enterUrl } = useAuthActions();
    const { isLoggedIn } = useAuthState();
    const profile = useAccountProfile({ enabled: isLoggedIn });
    const key = useAccountKey({ enabled: isLoggedIn });
    // The wallet is shown only for an unlimited key that may read it; ask only then.
    const canReadWallet =
        key.data?.pollenBudget === null &&
        (key.data.permissions?.account?.includes("usage") ?? false);
    const balance = useAccountBalance({
        enabled: isLoggedIn && canReadWallet,
    });
    const wallet = balance.data?.accountBalance;
    useEffect(() => {
        if (!isLoggedIn) return;
        const onVisible = () => {
            if (document.visibilityState !== "visible") return;
            void key.refresh();
            void balance.refresh();
        };
        document.addEventListener("visibilitychange", onVisible);
        return () =>
            document.removeEventListener("visibilitychange", onVisible);
    }, [isLoggedIn, key.refresh, balance.refresh]);
    const returnUrl =
        typeof window === "undefined" ? undefined : window.location.href;
    const topUpUrl = new URL("/top-up", enterUrl);
    if (returnUrl) topUpUrl.searchParams.set("redirect", returnUrl);
    const keyId = key.data?.id;
    let editKeyUrl: URL | undefined;
    if (keyId) {
        editKeyUrl = new URL("/edit-key", enterUrl);
        editKeyUrl.searchParams.set("id", keyId);
        if (returnUrl) editKeyUrl.searchParams.set("redirect", returnUrl);
    }
    let pollenSource: AccountPollenSource | undefined;
    if (key.data && key.data.pollenBudget !== null) {
        pollenSource = {
            type: "budget",
            remaining: key.data.pollenBudget,
            generationEnabled: key.data.permissions?.models?.length !== 0,
        };
    } else if (wallet) {
        pollenSource = {
            type: "wallet",
            balances: { paid: wallet.paid, quest: wallet.tier },
        };
    } else if (key.data && !canReadWallet) {
        pollenSource = { type: "budget", remaining: null };
    }

    return (
        <div
            data-theme="accent"
            className="polli:flex polli:shrink-0 polli:justify-end"
        >
            {!isLoggedIn ? (
                <LoginButton
                    className={cn(
                        "polli:gap-0 polli:overflow-hidden polli:border polli:border-theme-bg-active polli:bg-surface-white polli:p-0 polli:text-theme-text-strong polli:whitespace-nowrap polli:hover:bg-surface-white polli:[.dark_&]:bg-transparent polli:[.dark_&]:hover:bg-transparent",
                        connectSize === "lg"
                            ? "polli:h-12 polli:text-base"
                            : "polli:h-10",
                    )}
                >
                    {/* Amber cell with the mark, then a light cell with the label. */}
                    <span
                        aria-hidden="true"
                        className={cn(
                            "polli:flex polli:h-full polli:shrink-0 polli:items-center polli:justify-center polli:bg-theme-bg-active",
                            connectSize === "lg" ? "polli:w-12" : "polli:w-10",
                        )}
                    >
                        <span
                            className={cn(
                                "polli:relative polli:-top-px polli:left-px polli:block polli:bg-current",
                                connectSize === "lg"
                                    ? "polli:h-7 polli:w-7"
                                    : "polli:h-6 polli:w-6",
                            )}
                            style={{
                                mask: `url('${markUrl}') center / contain no-repeat`,
                                WebkitMask: `url('${markUrl}') center / contain no-repeat`,
                            }}
                        />
                    </span>
                    <span
                        className={
                            connectSize === "lg" ? "polli:px-4" : "polli:px-3"
                        }
                    >
                        {labels.authorize}
                    </span>
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
                        pollenSource ? (
                            <AccountPollen source={pollenSource} />
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
