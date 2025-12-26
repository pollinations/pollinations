import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { CopyProvider } from "./ui/contexts/CopyContext";
import { ThemeProvider } from "./ui/contexts/ThemeContext";
import "./styles.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");
const root = createRoot(rootElement);

root.render(
    <ThemeProvider>
        <BrowserRouter
            future={{
                v7_startTransition: true,
                v7_relativeSplatPath: true,
            }}
        >
            <CopyProvider>
                <App />
            </CopyProvider>
        </BrowserRouter>
    </ThemeProvider>
);
