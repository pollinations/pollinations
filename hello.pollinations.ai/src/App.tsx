import { Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import Layout from "./components/Layout";

// Lazy load pages
const HelloPage = lazy(() => import("./pages/HelloPage"));
const PlayPage = lazy(() => import("./pages/PlayPage"));
const AppsPage = lazy(() => import("./pages/AppsPage"));
const DocsPage = lazy(() => import("./pages/DocsPage"));
const CommunityPage = lazy(() => import("./pages/CommunityPage"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));

// Loading component
const PageLoader = () => (
    <div className="min-h-[50vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose"></div>
    </div>
);

function App() {
    return (
        <ErrorBoundary>
            <Suspense fallback={<PageLoader />}>
                <Routes>
                    <Route path="/" element={<Layout />}>
                        <Route index element={<HelloPage />} />
                        <Route path="play" element={<PlayPage />} />
                        <Route path="apps" element={<AppsPage />} />
                        <Route path="docs" element={<DocsPage />} />
                        <Route path="community" element={<CommunityPage />} />
                        <Route path="terms" element={<TermsPage />} />
                        <Route path="privacy" element={<PrivacyPage />} />
                        <Route
                            path="*"
                            element={<Navigate to="/" replace />}
                        />
                    </Route>
                </Routes>
            </Suspense>
        </ErrorBoundary>
    );
}

export default App;
