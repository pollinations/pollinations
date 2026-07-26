import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "../ui/site/LegalPage";

export const Route = createFileRoute("/refunds")({
    component: () => (
        <LegalPage
            markdownPath="/legal/REFUNDS_AND_CANCELLATIONS.md"
            errorLabel="refunds policy"
        />
    ),
});
