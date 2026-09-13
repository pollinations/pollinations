import "@frontend/style.css";
import { setColorMode } from "@pollinations/ui";
import { readState } from "./live-client";
import { screenRoute } from "./screen-route";

const query = new URLSearchParams(location.search);
const theme = query.get("theme");
if (theme === "light" || theme === "dark") setColorMode(theme);
if (query.get("thumbnail") === "1") document.documentElement.inert = true;

try {
    const state = await readState();
    const route = screenRoute(query, state, location.origin);
    if (!route) {
        // External pages are inventory references, never a successful local
        // GitHub sign-in or payment manufactured by a preview transport.
        const root = document.getElementById("root");
        const screen = query.get("screen") ?? "";
        if (root && /github|payment|checkout|billing/.test(screen)) {
            const { createRoot } = await import("react-dom/client");
            const { ProviderReference } = await import(
                "./pollen-connect-provider"
            );
            createRoot(root).render(
                <ProviderReference
                    github={screen.includes("github")}
                    billing={screen.includes("billing")}
                />,
            );
        } else if (root)
            root.textContent =
                "This page needs its external provider. Open it from Journey to continue the real flow.";
    } else if (route === "/connect-example.html") {
        history.replaceState(null, "", route);
        document.body.className = "polli-ui-shell";
        await import("./live-example");
    } else if (route.startsWith("/connect-admin.html")) {
        history.replaceState(null, "", route);
        await import("./live-admin");
    } else {
        history.replaceState(null, "", route);
        await import("./enter-entry");
        const screen = query.get("screen") ?? "";
        if (
            /^dash-(keys|apps|models|agents)-(create|edit|delete|visibility)$/.test(
                screen,
            ) ||
            screen === "dash-account-delete"
        ) {
            // Only open a real dialog. No submit, deletion, or profile mutation.
            const { installDashboardDriver } = await import(
                "./pollen-connect-dashboard-driver"
            );
            installDashboardDriver(screen, query);
        }
    }
    const reviewId = query.get("review_case");
    if (reviewId) {
        const { reviewFlows } = await import("./review-inventory");
        const recipe = reviewFlows
            .flatMap(({ cases }) => cases)
            .find(
                (recipe) =>
                    recipe.id === reviewId &&
                    recipe.query.screen === query.get("screen"),
            );
        if (recipe?.steps) {
            const { runReviewSteps } = await import("./review-driver");
            await runReviewSteps(recipe.steps);
        }
    }
} catch (error) {
    const root = document.getElementById("root");
    if (root) {
        root.setAttribute("role", "alert");
        root.textContent =
            error instanceof Error
                ? error.message
                : "Local services are unavailable.";
    }
}
