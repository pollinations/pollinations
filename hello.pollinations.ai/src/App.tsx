import { Routes, Route, Navigate } from "react-router-dom";
import { Suspense, lazy } from "react";
import ErrorBoundary from "./ui/components/ErrorBoundary";
import Layout from "./ui/components/Layout";
import { PresetEditor } from "./ui/components/theme";

import { FontLoader } from "./ui/components/FontLoader";

// Lazy load pages
const HelloPage = lazy(() => import("./ui/pages/HelloPage"));
const PlayPage = lazy(() => import("./ui/pages/PlayPage"));
const AppsPage = lazy(() => import("./ui/pages/AppsPage"));
const DocsPage = lazy(() => import("./ui/pages/DocsPage"));
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
                <Routes>
                    <Route path="/" element={<Layout />}>
                        <Route index element={<HelloPage />} />
                        <Route path="play" element={<PlayPage />} />
                        <Route path="apps" element={<AppsPage />} />
                        <Route path="docs" element={<DocsPage />} />
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
