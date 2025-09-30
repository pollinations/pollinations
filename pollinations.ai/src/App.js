import { Navigate, Route, Routes, useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import Header from "./Home/Header";
import Footer from "./Home/Footer";
import Home from "./Home";
import Terms from "./Home/Terms";
import { trackEvent } from "./config/analytics";
import { ThemeProvider } from "@mui/material/styles";
import { theme } from "./styles/theme";

const ReferralRedirect = () => {
    const [searchParams] = useSearchParams();
    const topic = searchParams.get("topic");

    useEffect(() => {
        // Track the referral event
        trackEvent({
            action: "referral_visit",
            category: topic,
            label: topic || "unknown",
            value: topic,
        });

        // Redirect to home page after 3 seconds to ensure tracking is registered
        const redirectTimeout = setTimeout(() => {
            window.location.href = "https://pollinations.ai";
        }, 3000);

        // Cleanup timeout if component unmounts
        return () => clearTimeout(redirectTimeout);
    }, [topic]);

    return null; // Component doesn't render anything
};

const AppRoutes = [
    {
        exact: true,
        path: "/",
        element: <Home />,
        key: "home",
    },
    {
        exact: true,
        path: "/terms",
        element: <Terms />,
        key: "terms",
    },
    {
        exact: true,
        path: "/referral",
        element: <ReferralRedirect />,
        key: "referral",
    },
    {
        path: "*",
        element: <Navigate to="/" replace={true} />,
        key: "404",
    },
];

const App = () => (
    <ThemeProvider theme={theme}>
        <Header />
        <Routes>
            {AppRoutes.map(({ key, ...route }) => (
                <Route key={key} {...route} />
            ))}
        </Routes>
        <Footer />
    </ThemeProvider>
);

export default App;
