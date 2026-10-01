import { createFileRoute } from "@tanstack/react-router";
import { routeHead } from "../routeMeta";
import CommunityPage from "../ui/pages/CommunityPage";

export const Route = createFileRoute("/community")({
    head: () => routeHead("/community"),
    component: CommunityPage,
});
