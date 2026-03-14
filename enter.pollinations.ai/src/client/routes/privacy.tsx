import { createFileRoute } from "@tanstack/react-router";
import privacyMarkdown from "../../../legal/PRIVACY_POLICY.md?raw";
import { LegalPageLayout } from "../components/layout/legal-page-layout";
import { useDocumentMeta } from "../hooks/use-document-meta.ts";

export const Route = createFileRoute("/privacy")({
    component: PrivacyComponent,
});

function PrivacyComponent() {
    useDocumentMeta(
        "Privacy Policy",
        "Privacy policy for pollinations.ai APIs and services.",
    );
    return <LegalPageLayout markdown={privacyMarkdown} currentPage="privacy" />;
}
