import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "../ui/site/LegalPage";

export const Route = createFileRoute("/privacy")({
    component: () => (
        <LegalPage
            markdownPath="/legal/PRIVACY_POLICY.md"
            errorLabel="privacy policy"
        />
    ),
});
