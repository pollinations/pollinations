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
    AccountIcon,
    ExternalLinkIcon,
    KeyIcon,
    LogInIcon,
    PowerIcon,
    WalletIcon,
} from "../../primitives/icons/index.tsx";
import { LoginButton } from "../auth/sdk.ts";
import { AccountPollen } from "../wallet/AccountPollen.tsx";

export type AppUserMenuLabels = {
    authorize: string;
    appUserMenu: string;
    thisApp: string;
    permissions: string;
    logout: string;
    yourAccount: string;
    topUpWallet: string;
    dashboard: string;
};

export type AppUserMenuProps = {
    /** Optional caller-owned dashboard destination for the menu item. */
    dashboardHref?: string;
    labels?: Partial<AppUserMenuLabels>;
    /** Logged-out CTA style. The connected account always uses a pill. */
    triggerVariant?: "pill" | "action";
};

const defaultLabels: AppUserMenuLabels = {
    authorize: "Connect Pollen",
    appUserMenu: "App user menu",
    thisApp: "This app",
    permissions: "Permissions",
    logout: "Disconnect",
    yourAccount: "Your account",
    topUpWallet: "Top up",
    dashboard: "Dashboard",
};

function MenuGroupLabel({ children }: { children: string }) {
    return (
        <span className="polli:block polli:px-3 polli:pt-1.5 polli:pb-0.5 polli:text-[0.65rem] polli:font-semibold polli:uppercase polli:tracking-wide polli:text-theme-text-base/70">
            {children}
        </span>
    );
}

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
                    menuLabel={labels.appUserMenu}
                    className="polli:max-w-64"
                    menuClassName="polli:w-max polli:min-w-0"
                    secondaryContent={
                        key.data ? (
                            <AccountPollen
                                source={{
                                    type: "budget",
                                    remaining: key.data.pollenBudget,
                                    generationEnabled:
                                        key.data.permissions?.models?.length !==
                                        0,
                                }}
                            />
                        ) : undefined
                    }
                >
                    {(close) => (
                        <>
                            <MenuGroupLabel>{labels.thisApp}</MenuGroupLabel>
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
                            <div
                                role="separator"
                                className="polli:my-1 polli:border-t polli:border-divider"
                            />
                            <MenuGroupLabel>
                                {labels.yourAccount}
                            </MenuGroupLabel>
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
                                as="a"
                                href={
                                    dashboardHref ??
                                    new URL("/pollen", enterUrl).href
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={close}
                            >
                                <AccountIcon
                                    className="polli:h-4 polli:w-4 polli:shrink-0"
                                    aria-hidden="true"
                                />
                                {labels.dashboard}
                                <ExternalLinkIcon
                                    className="polli:ml-auto polli:h-3.5 polli:w-3.5 polli:shrink-0"
                                    aria-hidden="true"
                                />
                            </DropdownItem>
                        </>
                    )}
                </AccountMenu>
            )}
        </div>
    );
}
