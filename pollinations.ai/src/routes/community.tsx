import { createFileRoute } from "@tanstack/react-router";
import CommunityPage from "../ui/pages/CommunityPage";

export const Route = createFileRoute("/community")({
    component: CommunityPage,
});
