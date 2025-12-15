import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ThemeProvider } from "./ui/contexts/ThemeContext";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);

root.render(
    <ThemeProvider>
        <BrowserRouter
            future={{
                v7_startTransition: true,
                v7_relativeSplatPath: true,
            }}
        >
            <App />
        </BrowserRouter>
    </ThemeProvider>
);
