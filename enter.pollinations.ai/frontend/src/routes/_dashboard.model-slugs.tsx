import { Prose, Surface } from "@pollinations/ui";
import { createFileRoute } from "@tanstack/react-router";
import modelSlugsMarkdown from "../../../MODEL_SLUGS.md?raw";

export const Route = createFileRoute("/_dashboard/model-slugs")({
    component: ModelSlugsReference,
});

function ModelSlugsReference() {
    return (
        <div className="mx-auto max-w-6xl">
            <Surface variant="panel" className="p-4 pt-12 sm:p-6">
                <Prose>{modelSlugsMarkdown}</Prose>
            </Surface>
        </div>
    );
}
