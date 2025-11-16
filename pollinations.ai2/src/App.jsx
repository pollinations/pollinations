import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import HomePage from "./pages/HomePage";
import PlayPage from "./pages/PlayPage";
import AppsPage from "./pages/AppsPage";
import DocsPage from "./pages/DocsPage";
import CommunityPage from "./pages/CommunityPage";

function App() {
    return (
        <Routes>
            <Route path="/" element={<Layout />}>
                <Route index element={<HomePage />} />
                <Route path="playground" element={<PlayPage />} />
                <Route path="projects" element={<AppsPage />} />
                <Route path="integration" element={<DocsPage />} />
                <Route path="community" element={<CommunityPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
        </Routes>
    );
}

export default App;
