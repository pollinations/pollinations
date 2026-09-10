import type { ReactNode } from "react";
import { AccountMenu } from "../../compositions/AccountMenu.tsx";
import { cn } from "../../lib/cn.ts";
import { DropdownItem } from "../../primitives/DropdownItem.tsx";
import {
    AppIcon,
    ExternalLinkIcon,
    KeyIcon,
    SignOutIcon,
} from "../../primitives/icons/index.tsx";
import { Surface } from "../../primitives/Surface.tsx";
import { PollinationsSignInButton } from "../auth/PollinationsSignInButton.tsx";
import { formatPollen } from "../wallet/format-pollen.ts";
import { PollenStatusBadge } from "../wallet/PollenStatusBadge.tsx";

export type AppUserMenuLabels = {
    authorize: string;
    addPollen: string;
    appUserMenu: string;
    dashboard: string;
    raiseLimit: string;
    logout: string;
    connectionError: string;
    checkingConnection: string;
    connectionCheckError: string;
    retryConnection: string;
};
const defaultLabels: AppUserMenuLabels = {
    authorize: "Connect with Pollinations",
    addPollen: "Add Pollen",
    appUserMenu: "App user menu",
    dashboard: "Dashboard",
    raiseLimit: "Raise limit",
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
    /** Confirmed account funding state, when the app has balance access. */
    pollenStatus?: "no-pollen";
    onDisconnect: () => void;
    onAddPollen?: () => void;
    dashboardHref?: string;
    raiseLimitHref?: string;
    labels?: Partial<AppUserMenuLabels>;
};

/** Shared app menu. Callers own account data, navigation and disconnection. */
export function AppUserMenuView({
    name,
    avatarUrl,
    remaining,
    pollenStatus,
    onDisconnect,
    onAddPollen,
    dashboardHref,
    raiseLimitHref,
    labels: overrides,
}: AppUserMenuViewProps) {
    const labels = { ...defaultLabels, ...overrides };
    const limitReached = remaining != null && remaining <= 0;
    return (
        <AccountMenu
            name={name}
            avatarUrl={avatarUrl}
            menuLabel={labels.appUserMenu}
            layout="stacked"
            className="polli:max-w-64 polli:shrink-0"
            menuClassName="polli:w-max polli:min-w-48"
            secondaryContent={
                pollenStatus ? (
                    <PollenStatusBadge state={pollenStatus} showIcon={false} />
                ) : remaining == null ? undefined : limitReached ? (
                    <PollenStatusBadge state="limit-reached" showIcon={false} />
                ) : (
                    <span
                        title="Available app Pollen"
                        className="polli:tabular-nums"
                    >
                        {formatPollen(remaining)} Pollen
                    </span>
                )
            }
        >
            {(close) => (
                <>
                    {onAddPollen && (
                        <DropdownItem
                            onClick={() => {
                                close();
                                onAddPollen();
                            }}
                        >
                            <KeyIcon
                                aria-hidden="true"
                                className="polli:h-4 polli:w-4 polli:shrink-0"
                            />
                            {labels.addPollen}
                        </DropdownItem>
                    )}
                    {dashboardHref && (
                        <DropdownItem
                            as="a"
                            href={dashboardHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={close}
                        >
                            <AppIcon
                                aria-hidden="true"
                                className="polli:h-4 polli:w-4 polli:shrink-0"
                            />
                            {labels.dashboard}
                            <ExternalLinkIcon
                                aria-hidden="true"
                                className="polli:ml-auto polli:h-3.5 polli:w-3.5 polli:shrink-0"
                            />
                        </DropdownItem>
                    )}
                    {!onAddPollen && limitReached && raiseLimitHref && (
                        <DropdownItem
                            as="a"
                            href={raiseLimitHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={close}
                        >
                            <KeyIcon
                                aria-hidden="true"
                                className="polli:h-4 polli:w-4 polli:shrink-0"
                            />
                            {labels.raiseLimit}
                            <ExternalLinkIcon
                                aria-hidden="true"
                                className="polli:ml-auto polli:h-3.5 polli:w-3.5 polli:shrink-0"
                            />
                        </DropdownItem>
                    )}
                    <DropdownItem
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
