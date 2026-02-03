import React from "react";
import ReactDOM from "react-dom/client";
import DataRoom from "./DataRoom";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");
ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
        <DataRoom />
    </React.StrictMode>,
);
