import { CssBaseline, createTheme, ThemeProvider } from "@mui/material";
import { useEffect } from "react";
import {
    Route,
    BrowserRouter as Router,
    Routes,
    useLocation,
} from "react-router-dom";
import FloatingAssistant from "./components/FloatingAssistant";
import Footer from "./components/Footer";
import Navbar from "./components/Navbar";
import About from "./pages/About";
import CodeOfConduct from "./pages/CodeOfConduct";
import Contributing from "./pages/Contributing";
import Home from "./pages/Home";
import Mentors from "./pages/Mentors";
import NotFound from "./pages/NotFound";
import Projects from "./pages/Projects";
import Polly from "./pages/socBot";
import Terms from "./pages/Terms";
import Timeline from "./pages/Timeline";
import "./App.css";

const darkTheme = createTheme({
    palette: {
        mode: "dark",
        primary: {
            main: "#ffffff",
        },
        background: {
            default: "#09090b",
            paper: "rgba(255, 255, 255, 0.03)",
        },
        text: {
            primary: "#ffffff",
            secondary: "#a1a1aa",
        },
    },
    typography: {
        fontFamily:
            'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                body: {
                    background: "#09090b",
                    margin: 0,
                    padding: 0,
                },
            },
        },
    },
});

// Scroll-to-top on route change
function ScrollToTop() {
    const { pathname } = useLocation();
    useEffect(() => {
        void pathname;
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }, [pathname]);
    return null;
}

function App() {
    return (
        <ThemeProvider theme={darkTheme}>
            <CssBaseline />
            <Router>
                <Navbar />
                <ScrollToTop />
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/projects" element={<Projects />} />
                    <Route path="/mentors" element={<Mentors />} />
                    <Route path="/timeline" element={<Timeline />} />
                    <Route path="/bot" element={<Polly />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/contributing" element={<Contributing />} />
                    <Route path="/coc" element={<CodeOfConduct />} />
                    <Route path="/terms" element={<Terms />} />
                    <Route path="*" element={<NotFound />} />
                </Routes>
                <Footer />
                <FloatingAssistant />
            </Router>
        </ThemeProvider>
    );
}

export default App;
