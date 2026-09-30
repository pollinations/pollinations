import { createFileRoute } from "@tanstack/react-router";
import PlayPage from "../ui/pages/PlayPage";

export const Route = createFileRoute("/play")({
    validateSearch: (search: Record<string, unknown>): { model?: string } => ({
        model: search.model === undefined ? undefined : String(search.model),
    }),
    component: PlayPage,
});
