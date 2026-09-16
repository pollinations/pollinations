import {
    useAccountKey,
    useAccountProfile,
    useAuthActions,
    useAuthState,
} from "@pollinations/sdk/react";
import { AccountMenu } from "../../compositions/AccountMenu.tsx";
import { cn } from "../../lib/cn.ts";
import { DropdownItem } from "../../primitives/DropdownItem.tsx";
import {
    ExternalLinkIcon,
    KeyIcon,
    LogInIcon,
    SignOutIcon,
    WalletIcon,
} from "../../primitives/icons/index.tsx";
import { LoginButton } from "../auth/sdk.ts";
import { Balance } from "../wallet/sdk.ts";

export type AppUserMenuLabels = {
    authorize: string;
    appUserMenu: string;
    editAppAllowance: string;
    topUpWallet: string;
    logout: string;
};

export type AppUserMenuProps = {
    /** Optional caller-owned dashboard destination for the linked avatar. */
    dashboardHref?: string;
    labels?: Partial<AppUserMenuLabels>;
    /** Logged-out CTA style. The connected account always uses a pill. */
    triggerVariant?: "pill" | "action";
};

const defaultLabels: AppUserMenuLabels = {
    authorize: "Connect Pollen",
    appUserMenu: "App user menu",
    editAppAllowance: "Edit app allowance",
    topUpWallet: "Top up wallet",
    logout: "Disconnect",
};

const actionTriggerClass =
    "polli:min-h-14 polli:rounded-xl polli:border-r-4 polli:border-b-4 polli:border-solid polli:border-theme-text-strong/20 polli:py-2 polli:hover:border-theme-text-strong/45";

export function AppUserMenu({
    dashboardHref,
    labels: labelOverrides,
    triggerVariant = "pill",
}: AppUserMenuProps) {
    const labels = { ...defaultLabels, ...labelOverrides };
    const { logout, enterUrl } = useAuthActions();
    const { isLoggedIn } = useAuthState();
    const profile = useAccountProfile({ enabled: isLoggedIn });
    const key = useAccountKey({ enabled: isLoggedIn });
    const returnUrl =
        typeof window === "undefined"
            ? undefined
            : new URL(window.location.pathname, window.location.origin).href;
    const topUpUrl = new URL("/top-up", enterUrl);
    if (returnUrl) topUpUrl.searchParams.set("redirect", returnUrl);
    const keyId = key.data?.id;
    const editAllowanceUrl = keyId ? new URL("/edit-key", enterUrl) : undefined;
    if (editAllowanceUrl && keyId) {
        editAllowanceUrl.searchParams.set("id", keyId);
        if (returnUrl) editAllowanceUrl.searchParams.set("redirect", returnUrl);
    }

    return (
        <div
            data-theme="accent"
            className="polli:flex polli:shrink-0 polli:justify-end"
        >
            {!isLoggedIn ? (
                <LoginButton
                    appearance={triggerVariant === "action" ? "raised" : "pill"}
                    className={cn(
                        "polli:gap-1.5 polli:whitespace-nowrap",
                        triggerVariant === "action" &&
                            `${actionTriggerClass} polli:px-4`,
                    )}
                >
                    <LogInIcon
                        className="polli:h-4 polli:w-4 polli:shrink-0"
                        aria-hidden="true"
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
                    className="polli:max-w-64"
                    menuClassName="polli:w-max polli:min-w-0"
                    secondaryContent={
                        <span className="polli:inline-flex polli:items-center polli:gap-1">
                            <KeyIcon
                                className="polli:h-3.5 polli:w-3.5 polli:shrink-0"
                                aria-hidden="true"
                            />
                            <Balance className="polli:bg-transparent polli:px-0 polli:py-0 polli:text-xs polli:text-theme-text-base" />
                        </span>
                    }
                >
                    {(close) => (
                        <>
                            {editAllowanceUrl && (
                                <DropdownItem
                                    as="a"
                                    href={editAllowanceUrl.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={close}
                                >
                                    <KeyIcon
                                        className="polli:h-4 polli:w-4 polli:shrink-0"
                                        aria-hidden="true"
                                    />
                                    {labels.editAppAllowance}
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
                                {labels.topUpWallet}
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
                                <SignOutIcon
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
