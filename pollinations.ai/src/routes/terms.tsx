import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../routeMeta";
import { LegalPage } from "../ui/site/LegalPage";

export const Route = createFileRoute("/terms")({
    head: () => routeHead("/terms"),
    component: () => (
        <LegalPage
            markdownPath="/legal/TERMS_OF_SERVICE.md"
            errorLabel="terms of service"
        />
    ),
});
