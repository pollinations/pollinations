import type { ReactNode } from "react";
import { AccountMenu } from "../../compositions/AccountMenu.tsx";
import { cn } from "../../lib/cn.ts";
import { DropdownItem } from "../../primitives/DropdownItem.tsx";
import {
    ExternalLinkIcon,
    KeyIcon,
    SignOutIcon,
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
    connectionCheckError: string;
    retryConnection: string;
};
const defaultLabels: AppUserMenuLabels = {
    authorize: "Connect with Pollinations",
    editAppAccess: "App access",
    wallet: "Account wallet",
    appUserMenu: "App user menu",
    logout: "Disconnect app",
    connectionError: "Connection was not completed. Please try again.",
    checkingConnection: "Checking connection…",
    connectionCheckError: "Couldn’t check your connection.",
    retryConnection: "Try again",
};

export type AppAccountState = "loading" | "account-error";

type AccountResourceState = {
    data: unknown;
    error: Error | null;
    isLoading: boolean;
};

/** Wait for both resources; never present failed or unresolved data as a connected menu. */
export function appAccountState(
    profile: AccountResourceState,
    key: AccountResourceState,
): AppAccountState | undefined {
    if (profile.isLoading || key.isLoading) return "loading";
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
    onRetry,
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
    onRetry?: (() => void) | null;
}) {
    const loadingLabel = pending
        ? (labels?.checkingConnection ?? defaultLabels.checkingConnection)
        : accountState === "loading"
          ? "Loading account…"
          : undefined;
    const accountError = accountState === "account-error";
    const retry = accountError ? onRetryAccount : onRetry;
    const message = accountError
        ? "Couldn’t load your account details."
        : onRetry
          ? (labels?.connectionCheckError ?? defaultLabels.connectionCheckError)
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
            ) : accountError || retry ? (
                <PollinationsSignInButton onClick={retry ?? undefined}>
                    {labels?.retryConnection ?? defaultLabels.retryConnection}
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
    labels: overrides,
}: AppUserMenuViewProps) {
    const labels = { ...defaultLabels, ...overrides };
    return (
        <AccountMenu
            name={name}
            avatarUrl={avatarUrl}
            dashboardHref={dashboardHref}
            menuLabel={labels.appUserMenu}
            layout="stacked"
            className="polli:max-w-64 polli:shrink-0"
            menuClassName="polli:w-max polli:min-w-48"
            secondaryContent={
                generationEnabled !== false &&
                remaining != null &&
                Number.isFinite(remaining) ? (
                    <AccountPollen
                        source={{
                            type: "allowance",
                            remaining,
                            generationEnabled,
                        }}
                    />
                ) : undefined
            }
        >
            {(close) => (
                <>
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
                            {labels.wallet}
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
