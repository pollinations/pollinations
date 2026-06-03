import { PolliProvider } from "@pollinations/sdk/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { CATGPT_APP_KEY, CATGPT_MODELS, ENTER_URL } from "./config";
import "./style.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

createRoot(rootElement).render(
    <StrictMode>
        <PolliProvider
            appKey={CATGPT_APP_KEY}
            enterUrl={ENTER_URL}
            permissions={["profile", "usage"]}
            models={CATGPT_MODELS}
            budget={5}
        >
            <App />
        </PolliProvider>
    </StrictMode>,
);
