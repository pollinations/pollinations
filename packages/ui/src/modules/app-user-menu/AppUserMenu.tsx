import {
    useAccountKey,
    useAccountProfile,
    useAuthActions,
    useAuthState,
} from "@pollinations/sdk/react";
import { useEffect } from "react";
import { LoginButton } from "../auth/sdk.ts";
import {
    type AppUserMenuLabels,
    AppUserMenuView,
    appAccountState,
    PollinationsConnectionPanel,
} from "./AppUserMenuView.tsx";

export type { AppUserMenuLabels } from "./AppUserMenuView.tsx";

export type AppUserMenuProps = {
    labels?: Partial<AppUserMenuLabels>;
};

/** SDK adapter; rendering is shared with apps that supply their own data. */
export function AppUserMenu({ labels }: AppUserMenuProps) {
    const { logout, enterUrl, retryConnection } = useAuthActions();
    const { isLoggedIn, isHydrated, error } = useAuthState();
    const profile = useAccountProfile({ enabled: isLoggedIn });
    const key = useAccountKey({ enabled: isLoggedIn });
    useEffect(() => {
        if (!isLoggedIn) return;
        const refresh = () => void key.refresh();
        window.addEventListener("focus", refresh);
        return () => window.removeEventListener("focus", refresh);
    }, [isLoggedIn, key.refresh]);
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
            accountState={
                isLoggedIn ? appAccountState(profile, key) : undefined
            }
            onRetryAccount={() => {
                void Promise.all([profile.refresh(), key.refresh()]);
            }}
            error={!!error}
            labels={labels}
            pending={!isHydrated}
            onRetry={retryConnection}
        >
            {!isLoggedIn ? (
                <LoginButton>{labels?.authorize}</LoginButton>
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
                    dashboardHref={new URL("/pollen", enterUrl).href}
                    editKeyHref={
                        key.data?.id
                            ? new URL(
                                  `/edit-key?${new URLSearchParams({ id: key.data.id, ...redirect })}`,
                                  enterUrl,
                              ).href
                            : undefined
                    }
                    walletHref={
                        new URL(
                            `/top-up?${new URLSearchParams(redirect)}`,
                            enterUrl,
                        ).href
                    }
                    labels={labels}
                />
            )}
        </PollinationsConnectionPanel>
    );
}
