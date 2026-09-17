import type { ReactNode } from "react";
import { AccountMenu } from "../../compositions/AccountMenu.tsx";
import { cn } from "../../lib/cn.ts";
import { DropdownItem } from "../../primitives/DropdownItem.tsx";
import {
    ExternalLinkIcon,
    KeyIcon,
    SignOutIcon,
    SproutIcon,
    WalletIcon,
} from "../../primitives/icons/index.tsx";
import { Surface } from "../../primitives/Surface.tsx";
import { PollinationsSignInButton } from "../auth/PollinationsSignInButton.tsx";
import { AccountPollen } from "../wallet/AccountPollen.tsx";

export type AppUserMenuLabels = {
    authorize: string;
    editAppAccess: string;
    wallet: string;
    appUserMenu: string;
    logout: string;
    connectionError: string;
    checkingConnection: string;
    retryAccount: string;
    getFreePollen: string;
    topUpAccount: string;
};
const defaultLabels: AppUserMenuLabels = {
    authorize: "Connect with Pollinations",
    editAppAccess: "App access",
    wallet: "Account wallet",
    appUserMenu: "App user menu",
    logout: "Disconnect app",
    connectionError: "Connection was not completed. Please try again.",
    checkingConnection: "Checking connection…",
    retryAccount: "Try again",
    getFreePollen: "Get free Pollen",
    topUpAccount: "Buy Pollen",
};

export type AppAccountState = "loading" | "account-error";

type AccountResourceState = {
    data: unknown;
    error: Error | null;
    isLoading: boolean;
};

/** Keep loaded data visible during refresh; hide failed or unresolved account data. */
export function appAccountState(
    profile: AccountResourceState,
    key: AccountResourceState,
): AppAccountState | undefined {
    if ((profile.isLoading || key.isLoading) && (!profile.data || !key.data)) {
        return "loading";
    }
    if (profile.error || key.error) return "account-error";
    if (!profile.data || !key.data) return "loading";
    return undefined;
}

/** Optional connection UI; the host app owns placement and can use SDK hooks instead. */
export function PollinationsConnectionPanel({
    children,
    error,
    labels,
    pending = false,
    className,
    accountState,
    onRetryAccount,
}: {
    accountState?: AppAccountState;
    onRetryAccount?: () => void;
    children: ReactNode;
    error?: boolean;
    labels?: Partial<AppUserMenuLabels>;
    pending?: boolean;
    className?: string;
}) {
    const loadingLabel = pending
        ? (labels?.checkingConnection ?? defaultLabels.checkingConnection)
        : accountState === "loading"
          ? "Loading account…"
          : undefined;
    const accountError = accountState === "account-error";
    const message = accountError
        ? "Couldn’t load your account details."
        : error
          ? (labels?.connectionError ?? defaultLabels.connectionError)
          : undefined;
    return (
        <Surface
            data-theme="accent"
            className={cn(
                "polli:flex polli:w-96 polli:max-w-full polli:shrink-0 polli:flex-col polli:items-center polli:gap-3",
                className,
            )}
        >
            {!loadingLabel && message && (
                <p role="alert" className="polli:w-full polli:text-sm">
                    {message}
                </p>
            )}
            {loadingLabel ? (
                <PollinationsSignInButton isPending>
                    {loadingLabel}
                </PollinationsSignInButton>
            ) : accountError ? (
                <PollinationsSignInButton onClick={onRetryAccount}>
                    {labels?.retryAccount ?? defaultLabels.retryAccount}
                </PollinationsSignInButton>
            ) : (
                children
            )}
        </Surface>
    );
}

export type AppUserMenuViewProps = {
    name: string;
    avatarUrl?: string | null;
    remaining?: number | null;
    generationEnabled?: boolean;
    onDisconnect: () => void;
    editKeyHref?: string;
    walletHref?: string;
    dashboardHref?: string;
    questsHref?: string;
    onTopUpKey?: () => void;
    labels?: Partial<AppUserMenuLabels>;
};

/** Shared app menu. Callers own account data, navigation and disconnection. */
export function AppUserMenuView({
    name,
    avatarUrl,
    remaining,
    generationEnabled,
    onDisconnect,
    editKeyHref,
    walletHref,
    dashboardHref,
    questsHref,
    onTopUpKey,
    labels: overrides,
}: AppUserMenuViewProps) {
    const labels = { ...defaultLabels, ...overrides };
    return (
        <AccountMenu
            name={name}
            avatarUrl={avatarUrl}
            dashboardHref={dashboardHref}
            menuLabel={labels.appUserMenu}
            className="polli:max-w-64 polli:shrink-0"
            menuClassName="polli:w-max polli:min-w-48"
            secondaryContent={
                generationEnabled !== false &&
                remaining != null &&
                Number.isFinite(remaining) ? (
                    <AccountPollen
                        source={{
                            type: "budget",
                            remaining,
                            generationEnabled,
                        }}
                    />
                ) : undefined
            }
        >
            {(close) => (
                <>
                    {onTopUpKey && (
                        <DropdownItem
                            onClick={() => {
                                close();
                                onTopUpKey();
                            }}
                        >
                            <KeyIcon className="polli:h-4 polli:w-4 polli:shrink-0" />
                            Add Pollen
                        </DropdownItem>
                    )}
                    {questsHref && (
                        <DropdownItem
                            as="a"
                            href={questsHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={close}
                        >
                            <SproutIcon className="polli:h-4 polli:w-4 polli:shrink-0" />
                            {labels.getFreePollen}
                            <ExternalLinkIcon className="polli:ml-auto polli:h-3.5 polli:w-3.5" />
                        </DropdownItem>
                    )}
                    {editKeyHref && (
                        <DropdownItem
                            as="a"
                            href={editKeyHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={close}
                        >
                            <KeyIcon
                                aria-hidden="true"
                                className="polli:h-4 polli:w-4 polli:shrink-0"
                            />
                            {labels.editAppAccess}
                            <ExternalLinkIcon
                                aria-hidden="true"
                                className="polli:ml-auto polli:h-3.5 polli:w-3.5 polli:shrink-0"
                            />
                        </DropdownItem>
                    )}
                    {walletHref && (
                        <DropdownItem
                            as="a"
                            href={walletHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={close}
                        >
                            <WalletIcon
                                aria-hidden="true"
                                className="polli:h-4 polli:w-4 polli:shrink-0"
                            />
                            {overrides?.topUpAccount ?? labels.wallet}
                            <ExternalLinkIcon
                                aria-hidden="true"
                                className="polli:ml-auto polli:h-3.5 polli:w-3.5 polli:shrink-0"
                            />
                        </DropdownItem>
                    )}
                    <DropdownItem
                        data-pollinations-action="disconnect"
                        onClick={() => {
                            close();
                            onDisconnect();
                        }}
                    >
                        <SignOutIcon
                            aria-hidden="true"
                            className="polli:h-4 polli:w-4 polli:shrink-0"
                        />
                        {labels.logout}
                    </DropdownItem>
                </>
            )}
        </AccountMenu>
    );
}
