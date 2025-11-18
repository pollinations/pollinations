import { Routes, Route, Navigate } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import Layout from "./components/Layout";
import HelloPage from "./pages/HelloPage";
import PlayPage from "./pages/PlayPage";
import AppsPage from "./pages/AppsPage";
import DocsPage from "./pages/DocsPage";
import CommunityPage from "./pages/CommunityPage";
import TermsPage from "./pages/TermsPage";
import PrivacyPage from "./pages/PrivacyPage";

function App() {
    return (
        <ErrorBoundary>
            <Routes>
                <Route path="/" element={<Layout />}>
                    <Route index element={<Navigate to="/hello" replace />} />
                    <Route path="hello" element={<HelloPage />} />
                    <Route path="play" element={<PlayPage />} />
                    <Route path="apps" element={<AppsPage />} />
                    <Route path="docs" element={<DocsPage />} />
                    <Route path="community" element={<CommunityPage />} />
                    <Route path="terms" element={<TermsPage />} />
                    <Route path="privacy" element={<PrivacyPage />} />
                    <Route
                        path="*"
                        element={<Navigate to="/hello" replace />}
                    />
                </Route>
            </Routes>
        </ErrorBoundary>
    );
}

export default App;
