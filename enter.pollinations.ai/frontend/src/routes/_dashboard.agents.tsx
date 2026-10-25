import { createFileRoute } from "@tanstack/react-router";
import { Models } from "../components/models";
import { validateCatalogSearch } from "../components/models/model-search.ts";

export const Route = createFileRoute("/_dashboard/agents")({
    validateSearch: validateCatalogSearch,
    component: () => <Models kind="agent" />,
});
