import { createFileRoute } from "@tanstack/react-router";
import privacyMarkdown from "../../../legal/PRIVACY_POLICY.md?raw";
import { LegalPageLayout } from "../components/LegalPageLayout";

export const Route = createFileRoute("/privacy")({
    component: PrivacyComponent,
});

function PrivacyComponent() {
    return <LegalPageLayout markdown={privacyMarkdown} currentPage="privacy" />;
}
