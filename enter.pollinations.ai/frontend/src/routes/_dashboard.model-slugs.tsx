import { Prose, Surface } from "@pollinations/ui";
import { createFileRoute } from "@tanstack/react-router";
import modelSlugsMarkdown from "../../../../MODEL_SLUGS.md?raw";

export const Route = createFileRoute("/_dashboard/model-slugs")({
    component: ModelSlugsReference,
});

function ModelSlugsReference() {
    return (
        <div className="mx-auto max-w-6xl">
            <Surface variant="panel" className="p-4 pt-12 sm:p-6">
                <Prose className="[&_td_code]:!bg-transparent [&_td_code]:!px-0 [&_td_code]:!py-0 [&_td:nth-child(2)_code]:!text-intent-danger-text [&_td:nth-child(3)_code]:!text-intent-success-text [&_th:nth-child(2)]:text-intent-danger-text [&_th:nth-child(3)]:text-intent-success-text">
                    {modelSlugsMarkdown}
                </Prose>
            </Surface>
        </div>
    );
}
