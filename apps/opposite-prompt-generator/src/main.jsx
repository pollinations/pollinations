import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { Toaster } from "sonner";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
    <StrictMode>
        <App />
        <Toaster richColors position="top-right" />
    </StrictMode>,
);
