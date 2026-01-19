import { createFileRoute } from "@tanstack/react-router";
import termsMarkdown from "../../../legal/TERMS_OF_SERVICE.md?raw";
import { LegalPageLayout } from "../components/LegalPageLayout";

export const Route = createFileRoute("/terms")({
    component: TermsComponent,
});

function TermsComponent() {
    return <LegalPageLayout markdown={termsMarkdown} currentPage="terms" />;
}
