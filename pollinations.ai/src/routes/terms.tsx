import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "../ui/site/LegalPage";

export const Route = createFileRoute("/terms")({
    component: () => (
        <LegalPage
            markdownPath="/legal/TERMS_OF_SERVICE.md"
            errorLabel="terms of service"
        />
    ),
});
