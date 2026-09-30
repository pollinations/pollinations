import { createFileRoute } from "@tanstack/react-router";
import AppsPage from "../ui/pages/AppsPage";

type AppsSearch = { filter?: string; sort?: string; query?: string };

// The router parses numeric-looking values as numbers; the page expects text.
const text = (value: unknown) =>
    value === undefined ? undefined : String(value);

export const Route = createFileRoute("/apps")({
    validateSearch: (search: Record<string, unknown>): AppsSearch => ({
        filter: text(search.filter),
        sort: text(search.sort),
        query: text(search.query),
    }),
    component: AppsPage,
});
