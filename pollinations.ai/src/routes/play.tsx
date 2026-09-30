import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../routeMeta";
import PlayPage from "../ui/pages/PlayPage";

export const Route = createFileRoute("/play")({
    head: () => routeHead("/play"),
    // The router parses every search value as text.
    validateSearch: (search: Record<string, unknown>) =>
        search as { model?: string },
    component: PlayPage,
});
