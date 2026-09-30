import { createFileRoute } from "@tanstack/react-router";
import PrivacyPage from "../ui/pages/PrivacyPage";

export const Route = createFileRoute("/privacy")({
    component: PrivacyPage,
});
