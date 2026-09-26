import "@frontend/style.css";
import { setColorMode } from "@pollinations/ui";
import { readState } from "./live-client";
import { ADMIN_ORIGIN } from "./local-origins";
import {
    clearReviewSteps,
    initialReviewSteps,
    queueReviewSteps,
    runReviewSteps,
} from "./review-driver";
import { reviewCasesForFlow } from "./review-inventory";
import { screenRoute } from "./screen-route";

const query = new URLSearchParams(location.search);
const theme = query.get("theme");
if (theme === "light" || theme === "dark") setColorMode(theme);
if (query.get("thumbnail") === "1") document.documentElement.inert = true;

async function openScreen() {
    const state = await readState();
    const route = screenRoute(query, state, location.origin);
    let steps: Parameters<typeof queueReviewSteps>[0] = [];
    const reviewId = query.get("review_case");
    if (reviewId) {
        const recipe = reviewCasesForFlow(
            query.get("review_flow") ?? "",
            query.get("review_section") ?? "",
        ).find(
            (recipe) =>
                recipe.id === reviewId &&
                Object.entries(recipe.query).every(
                    ([key, value]) => query.get(key) === value,
                ),
        );
        if (!recipe)
            throw new Error(
                "The selected review situation does not match this flow.",
            );
        steps = initialReviewSteps(recipe);
    }
    if (route?.startsWith(ADMIN_ORIGIN)) {
        queueReviewSteps(steps);
        location.replace(route);
        return;
    }
    if (!route) {
        // External pages are inventory references, never a successful local
        // GitHub sign-in or payment manufactured by a preview transport.
        const root = document.getElementById("root");
        const screen = query.get("screen") ?? "";
        if (root && /github|payment|checkout|billing/.test(screen)) {
            const { createRoot } = await import("react-dom/client");
            const { ProviderReference } = await import("./flow-provider");
            createRoot(root).render(
                <ProviderReference
                    github={screen.includes("github")}
                    billing={screen.includes("billing")}
                />,
            );
        } else if (root)
            root.textContent =
                "This page needs its external provider. Open it from Journey to continue the real flow.";
    } else if (route === "/flow-example.html") {
        history.replaceState(null, "", route);
        document.body.className = "polli-ui-shell";
        await import("./live-example");
    } else if (location.origin === ADMIN_ORIGIN) {
        clearReviewSteps();
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
                "./flow-dashboard-driver"
            );
            installDashboardDriver(screen, query);
        }
    }
    if (steps.length) await runReviewSteps(steps);
}
void openScreen().catch((error) => {
    document.documentElement.dataset.flowBootstrapError = "true";
    const root = document.getElementById("root");
    if (root) {
        root.setAttribute("role", "alert");
        root.textContent =
            error instanceof Error
                ? error.message
                : "Local services are unavailable.";
    }
});
