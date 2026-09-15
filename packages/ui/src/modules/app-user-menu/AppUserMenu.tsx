import {
    useAccountKey,
    useAccountProfile,
    useAuthActions,
    useAuthState,
} from "@pollinations/sdk/react";
import { useEffect } from "react";
import { LogInIcon } from "../../primitives/icons/index.tsx";
import { ProviderSignInButton } from "../auth/ProviderSignInButton.tsx";
import { LoginButton } from "../auth/sdk.ts";
import {
    type AppUserMenuLabels,
    AppUserMenuView,
    appAccountState,
    PollinationsConnectionPanel,
} from "./AppUserMenuView.tsx";

export type { AppUserMenuLabels } from "./AppUserMenuView.tsx";

export type AppUserMenuState =
    | "checking-connection"
    | "connection-error"
    | "connection-check-error"
    | "loading-account"
    | "account-error"
    | "connected"
    | "signed-out";

export type AppUserMenuProps = {
    labels?: Partial<AppUserMenuLabels>;
    dashboardHref?: string;
    onTopUpKey?: () => void;
    triggerVariant?: "pill" | "action";
    onStateChange?: (state: AppUserMenuState) => void;
};

/** SDK adapter; rendering is shared with apps that supply their own data. */
export function AppUserMenu({
    labels,
    onStateChange,
    dashboardHref,
    onTopUpKey,
    triggerVariant,
}: AppUserMenuProps) {
    const { login, logout, enterUrl, retryConnection } = useAuthActions();
    const { isLoggedIn, isHydrated, error } = useAuthState();
    const profile = useAccountProfile({ enabled: isLoggedIn });
    const key = useAccountKey({ enabled: isLoggedIn });
    const accountState = isLoggedIn ? appAccountState(profile, key) : undefined;
    const state: AppUserMenuState = !isHydrated
        ? "checking-connection"
        : accountState === "loading"
          ? "loading-account"
          : accountState === "account-error"
            ? "account-error"
            : retryConnection
              ? "connection-check-error"
              : error
                ? "connection-error"
                : isLoggedIn
                  ? "connected"
                  : "signed-out";
    useEffect(() => onStateChange?.(state), [onStateChange, state]);
    useEffect(() => {
        if (!isLoggedIn || accountState !== undefined) return;
        const refresh = () => void key.refresh();
        window.addEventListener("focus", refresh);
        return () => window.removeEventListener("focus", refresh);
    }, [isLoggedIn, accountState, key.refresh]);
    const redirect: Record<string, string> =
        typeof window === "undefined"
            ? {}
            : {
                  redirect: new URL(
                      window.location.pathname,
                      window.location.origin,
                  ).href,
              };
    return (
        <PollinationsConnectionPanel
            accountState={accountState}
            onRetryAccount={() => {
                void Promise.all([profile.refresh(), key.refresh()]);
            }}
            error={!!error}
            labels={labels}
            pending={!isHydrated && triggerVariant !== "action"}
            onRetry={retryConnection}
        >
            {!isLoggedIn ? (
                triggerVariant === "action" ? (
                    <ProviderSignInButton
                        icon={
                            <LogInIcon className="polli:h-4 polli:w-4 polli:shrink-0" />
                        }
                        appearance="raised"
                        disabled={!isHydrated}
                        onClick={() => login()}
                        className="polli:min-h-14 polli:rounded-xl polli:border-r-4 polli:border-b-4 polli:border-solid polli:border-theme-text-strong/20 polli:px-4 polli:py-2 polli:hover:border-theme-text-strong/45"
                    >
                        {!isHydrated
                            ? (labels?.checkingConnection ??
                              "Checking connection…")
                            : (labels?.authorize ?? "Connect Pollen")}
                    </ProviderSignInButton>
                ) : (
                    <LoginButton appearance={triggerVariant}>
                        {labels?.authorize}
                    </LoginButton>
                )
            ) : (
                <AppUserMenuView
                    name={
                        profile.data?.githubUsername ||
                        profile.data?.name ||
                        "Connected user"
                    }
                    avatarUrl={profile.data?.image}
                    remaining={key.data?.pollenBudget}
                    generationEnabled={
                        key.data?.permissions?.models?.length !== 0
                    }
                    onDisconnect={logout}
                    dashboardHref={
                        dashboardHref ?? new URL("/pollen", enterUrl).href
                    }
                    onTopUpKey={onTopUpKey}
                    questsHref={
                        !dashboardHref && !onTopUpKey
                            ? new URL("/quests", enterUrl).href
                            : undefined
                    }
                    editKeyHref={
                        key.data?.id
                            ? new URL(
                                  `/edit-key?${new URLSearchParams({ id: key.data.id, ...redirect })}`,
                                  enterUrl,
                              ).href
                            : undefined
                    }
                    walletHref={
                        onTopUpKey
                            ? undefined
                            : (dashboardHref ??
                              new URL(
                                  `/top-up?${new URLSearchParams(redirect)}`,
                                  enterUrl,
                              ).href)
                    }
                    labels={labels}
                />
            )}
        </PollinationsConnectionPanel>
    );
}
