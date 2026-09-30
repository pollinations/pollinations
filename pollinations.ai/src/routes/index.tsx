import { createFileRoute } from "@tanstack/react-router";
import HelloPage from "../ui/pages/HelloPage";

export const Route = createFileRoute("/")({
    component: HelloPage,
});
