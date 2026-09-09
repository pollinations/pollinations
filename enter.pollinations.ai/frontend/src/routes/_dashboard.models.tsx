import { createFileRoute } from "@tanstack/react-router";
import { Models } from "../components/models";
import { validateModelSearch } from "../components/models/model-search.ts";

export const Route = createFileRoute("/_dashboard/models")({
    validateSearch: validateModelSearch,
    component: Models,
});
