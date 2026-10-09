import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../routeMeta";
import { LegalPage } from "../ui/site/LegalPage";

export const Route = createFileRoute("/dpa")({
    head: () => routeHead("/dpa"),
    component: () => (
        <LegalPage
            markdownPath="/legal/DATA_PROCESSING_ADDENDUM.md"
            errorLabel="data processing addendum"
        />
    ),
});
