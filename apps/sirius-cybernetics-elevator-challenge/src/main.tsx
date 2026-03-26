import React from "react";
import ReactDOM from "react-dom/client";
import Index from "./pages/index";
import "./styles/globals.css";

// biome-ignore lint/style/noNonNullAssertion: root element is guaranteed to exist in index.html
ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <Index />
    </React.StrictMode>,
);
