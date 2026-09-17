import { PolliProvider, useAuthState } from "@pollinations/sdk/react";
import { setColorMode, useColorMode } from "@pollinations/ui";
import { AppUserMenu } from "@pollinations/ui/app-user-menu/sdk";
import { createRoot } from "react-dom/client";
import { readState } from "./live-client";
import { exampleStorage } from "./review-storage";
import "@pollinations/ui/app.css";
import "./pollen-connect-provider.css";

const mode = localStorage.getItem("polli-color-mode");
if (mode === "light" || mode === "dark") setColorMode(mode);

function Example({ appKey }: { appKey: string }) {
    useColorMode();
    return (
        <PolliProvider
            appKey={appKey}
            storage={exampleStorage}
            enterUrl={location.origin}
            apiBaseUrl={`${location.origin}/gen`}
            permissions={["profile", "usage", "keys"]}
            budget={5}
            expiry={7}
        >
            <ExampleMenu />
        </PolliProvider>
    );
}

function ExampleMenu() {
    const { isHydrated, isLoggedIn } = useAuthState();
    const state = !isHydrated
        ? "checking-connection"
        : isLoggedIn
          ? "connected"
          : "signed-out";
    return (
        <main
            className="connect-developer-app"
            data-theme="accent"
            data-connect-state={state}
        >
            <AppUserMenu labels={{ appUserMenu: "App account menu" }} />
        </main>
    );
}

const element = document.getElementById("root");
if (!element) throw new Error("Missing example root");
const root = createRoot(element);
readState().then(
    (state) => root.render(<Example appKey={state.connection.clientId} />),
    (error: Error) => {
        document.documentElement.dataset.connectBootstrapError = "true";
        root.render(<p role="alert">{error.message}</p>);
    },
);

// Resume Connect review actions after real route/callback navigation.
void import("./review-driver").then(({ runReviewSteps }) => runReviewSteps());
