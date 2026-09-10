import {
    useAccountKey,
    useAccountProfile,
    useAuthActions,
    useAuthState,
} from "@pollinations/sdk/react";
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
    onTopUpKey?: () => void;
};

/** SDK adapter; rendering is shared with apps that supply their own data. */
export function AppUserMenu({ labels, onTopUpKey }: AppUserMenuProps) {
    const { logout, enterUrl, retryConnection } = useAuthActions();
    const { isLoggedIn, isHydrated, error } = useAuthState();
    const profile = useAccountProfile({ enabled: isLoggedIn });
    const key = useAccountKey({ enabled: isLoggedIn });
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
                    onDisconnect={logout}
                    onAddPollen={onTopUpKey}
                    dashboardHref={new URL("/pollen", enterUrl).href}
                    raiseLimitHref={new URL("/keys", enterUrl).href}
                    labels={labels}
                />
            )}
        </PollinationsConnectionPanel>
    );
}
