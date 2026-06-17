import { PolliProvider } from "@pollinations/sdk/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ENTER_URL, POLLI_APP_KEY } from "./config";
import "./style.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

createRoot(rootElement).render(
    <StrictMode>
        <PolliProvider
            appKey={POLLI_APP_KEY}
            enterUrl={ENTER_URL}
            permissions={["profile", "usage"]}
        >
            <App />
        </PolliProvider>
    </StrictMode>,
);
