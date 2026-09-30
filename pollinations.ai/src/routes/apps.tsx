import { createFileRoute } from "@tanstack/react-router";
import AppsPage from "../ui/pages/AppsPage";

type AppsSearch = { filter?: string; sort?: string; query?: string };

export const Route = createFileRoute("/apps")({
    // The router parses every search value as text.
    validateSearch: (search: Record<string, unknown>) => search as AppsSearch,
    component: AppsPage,
});
