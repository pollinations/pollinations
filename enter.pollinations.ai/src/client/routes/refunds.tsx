import { createFileRoute } from "@tanstack/react-router";
import refundsMarkdown from "../../../legal/REFUNDS_AND_CANCELLATIONS.md?raw";
import { LegalPageLayout } from "../components/layout/legal-page-layout";

export const Route = createFileRoute("/refunds")({
    component: RefundsComponent,
});

function RefundsComponent() {
    return <LegalPageLayout markdown={refundsMarkdown} currentPage="refunds" />;
}
