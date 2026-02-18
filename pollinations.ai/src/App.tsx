import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import ErrorBoundary from "./ui/components/ErrorBoundary";
import { FontLoader } from "./ui/components/FontLoader";
import Layout from "./ui/components/Layout";
import { PresetEditor } from "./ui/components/theme";

function ScrollToTop() {
    const location = useLocation();
    // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on route change
    useEffect(() => {
        window.scrollTo(0, 0);
    }, [location.pathname]);
    return null;
}

// Lazy load pages
const HelloPage = lazy(() => import("./ui/pages/HelloPage"));
const PlayPage = lazy(() => import("./ui/pages/PlayPage"));
const AppsPage = lazy(() => import("./ui/pages/AppsPage"));
const CommunityPage = lazy(() => import("./ui/pages/CommunityPage"));
const TermsPage = lazy(() => import("./ui/pages/TermsPage"));
const PrivacyPage = lazy(() => import("./ui/pages/PrivacyPage"));

// Loading component
const PageLoader = () => (
    <div className="min-h-[50vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-border-brand"></div>
    </div>
);

function App() {
    return (
        <ErrorBoundary>
            <FontLoader />
            <PresetEditor />
            <Suspense fallback={<PageLoader />}>
                <ScrollToTop />
                <Routes>
                    <Route path="/" element={<Layout />}>
                        <Route index element={<HelloPage />} />
                        <Route path="play" element={<PlayPage />} />
                        <Route path="apps" element={<AppsPage />} />
                        <Route
                            path="docs"
                            element={<Navigate to="/play" replace />}
                        />
                        <Route path="community" element={<CommunityPage />} />
                        <Route path="terms" element={<TermsPage />} />
                        <Route path="privacy" element={<PrivacyPage />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                </Routes>
            </Suspense>
        </ErrorBoundary>
    );
}

export default App;
