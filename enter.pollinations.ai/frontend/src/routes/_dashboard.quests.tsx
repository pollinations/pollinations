import { createFileRoute } from "@tanstack/react-router";
import { QuestOverview } from "../components/quests";

export const Route = createFileRoute("/_dashboard/quests")({
    component: QuestOverview,
});
