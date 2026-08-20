import { Prose, Surface } from "@pollinations/ui";
import logoLockupUrl from "@pollinations/ui/brand/lockup-horizontal.svg";
import { createFileRoute } from "@tanstack/react-router";
import modelSlugsMarkdown from "../../../../MODEL_SLUGS.md?raw";

const modelSlugsContent = modelSlugsMarkdown.replace(
    /^<picture>[\s\S]*?<\/picture>\s*/,
    "",
);

export const Route = createFileRoute("/_dashboard/model-slugs")({
    component: ModelSlugsReference,
});

function ModelSlugsReference() {
    return (
        <div className="mx-auto max-w-6xl">
            <Surface variant="panel" className="p-4 pt-12 sm:p-6">
                <span
                    role="img"
                    aria-label="Pollinations.ai"
                    className="mb-8 block h-9 w-72 max-w-full bg-current text-theme-text-strong"
                    style={{
                        WebkitMask: `url(${logoLockupUrl}) left center / contain no-repeat`,
                        mask: `url(${logoLockupUrl}) left center / contain no-repeat`,
                    }}
                />
                <Prose className="[&_td:first-child]:text-intent-warning-text [&_td_code]:!bg-transparent [&_td_code]:!px-0 [&_td_code]:!py-0 [&_td:nth-child(2)_code]:!text-intent-danger-text [&_td:nth-child(3)_code]:!text-intent-success-text [&_th:first-child]:text-intent-warning-text [&_th:nth-child(2)]:text-intent-danger-text [&_th:nth-child(3)]:text-intent-success-text">
                    {modelSlugsContent}
                </Prose>
            </Surface>
        </div>
    );
}
