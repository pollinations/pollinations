import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "./ui/contexts/ThemeContext";
import { PageCopyProvider } from "./ui/contexts/PageCopyContext";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);

root.render(
    <ThemeProvider>
        <PageCopyProvider>
            <BrowserRouter
                future={{
                    v7_startTransition: true,
                    v7_relativeSplatPath: true,
                }}
            >
                <App />
            </BrowserRouter>
        </PageCopyProvider>
    </ThemeProvider>
);
