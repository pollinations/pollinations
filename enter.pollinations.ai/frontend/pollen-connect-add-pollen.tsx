import {
    type AppAccountState,
    AppUserMenuView,
    PollinationsConnectionPanel,
} from "@pollinations/ui";
import { PollinationsSignInButton } from "@pollinations/ui/auth";
import { useState } from "react";

export type AddPollenStage = "play" | "connect";

// Inert developer-app shell. Account actions use the real Pollinations routes.
export function AddPollenPreview({
    initialStage,
    scenario,
}: {
    initialStage: AddPollenStage;
    scenario: string | null;
}) {
    const params = new URLSearchParams(location.search);
    const consent = params.get("consent");
    const generationEnabled = consent
        ? JSON.parse(consent).generationEnabled !== false
        : params.get("request_models") !== "none";
    const dashboardParams = new URLSearchParams(params);
    dashboardParams.set("screen", "enter-connected");
    const [stage, setStage] = useState(initialStage);
    const budget = Number(
        params.get("sim_budget") ?? (scenario === "limit-reached" ? 0 : 5),
    );
    const previewHref = (screen: string) => {
        const next = new URLSearchParams(params);
        next.set("screen", screen);
        next.set("account_action", "1");
        next.delete("action");
        return `/pollen-connect-screen.html?${next}`;
    };
    return (
        <main className="connect-developer-app" data-theme="accent">
            {stage === "connect" ? (
                <PollinationsConnectionPanel
                    error={params.get("app_callback") === "error"}
                    pending={params.get("app_callback") === "waiting"}
                    onRetry={
                        params.get("app_callback") === "check-error"
                            ? () => {
                                  const next = new URL(location.href);
                                  next.searchParams.set(
                                      "app_callback",
                                      "waiting",
                                  );
                                  location.href = next.href;
                              }
                            : undefined
                    }
                >
                    <PollinationsSignInButton
                        onClick={() => {
                            const params = new URLSearchParams(location.search);
                            params.set("screen", "oauth-signed-out");
                            params.set("app_title", "App example");
                            location.href = `/pollen-connect-screen.html?${params}`;
                        }}
                    />
                </PollinationsConnectionPanel>
            ) : (
                <PollinationsConnectionPanel
                    accountState={
                        params.get("app_account") as AppAccountState | undefined
                    }
                    onRetryAccount={() => {
                        const next = new URL(location.href);
                        next.searchParams.set("app_account", "loading");
                        location.href = next.href;
                    }}
                >
                    <AppUserMenuView
                        name="moss.exe"
                        avatarUrl="/pollen-connect-preview/moss.png"
                        remaining={Number.isFinite(budget) ? budget : undefined}
                        generationEnabled={generationEnabled}
                        dashboardHref={`/pollen-connect-screen.html?${dashboardParams}`}
                        editKeyHref={previewHref("account-key")}
                        walletHref={previewHref("account-wallet")}
                        onDisconnect={() => setStage("connect")}
                        labels={{ appUserMenu: "App account menu" }}
                    />
                </PollinationsConnectionPanel>
            )}
        </main>
    );
}
