import "@pollinations/ui/app.css";
import { DashboardSignIn } from "@pollinations/ui/auth";
import { createRoot } from "react-dom/client";

const login = document.querySelector<HTMLMetaElement>(
    'meta[name="flow-login"]',
);
if (!login) throw new Error("Flow sign-in URL was not provided.");
const loginUrl = login.content;
const url = new URL(window.location.href);

const root = document.getElementById("root");
if (root)
    createRoot(root).render(
        <DashboardSignIn
            appName="Pollinations Flow"
            description="Sign in with your Pollinations account to explore product flows in your own disposable environment. Screens use sample data."
            authError={
                url.pathname === "/flow-reviewer/auth/error"
                    ? url.searchParams.get("auth_error")
                    : null
            }
            onSignIn={() => window.open(loginUrl, "_top")}
        />,
    );
