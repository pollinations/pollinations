import { type ComponentProps, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { CommunityEndpointCard } from "../frontend/src/components/community-endpoints/community-endpoint-card.tsx";
import type { CommunityEndpoint } from "../frontend/src/components/community-endpoints/types.ts";

const promptAgentEndpoint: CommunityEndpoint = {
    id: "ep-1",
    modelId: "voodoohop/story-model",
    name: "voodoohop/story-model",
    title: "Story Model",
    description: null,
    baseUrl: "",
    upstreamModel: "",
    visibility: "public",
    hidden: false,
    hiddenReason: null,
    hiddenAt: null,
    type: "prompt_agent",
};

function renderCard(
    overrides: Partial<Pick<CommunityEndpoint, "modelId" | "type">> = {},
): string {
    const endpoint = {
        ...promptAgentEndpoint,
        ...overrides,
    } as CommunityEndpoint;
    const props: ComponentProps<typeof CommunityEndpointCard> = {
        endpoint,
        isToggling: false,
        onToggle: () => {},
        onEdit: () => {},
        onDelete: () => {},
    };
    return renderToStaticMarkup(createElement(CommunityEndpointCard, props));
}

test("community model cards link to their earnings activity", () => {
    const markup = renderCard();

    expect(markup).toContain("View earnings activity");
    expect(markup).toContain(
        'href="/activity?earningsModels=voodoohop%2Fstory-model"',
    );
});

test("the activity link encodes model ids with special characters", () => {
    const markup = renderCard({ modelId: "owner/model+variant" });

    expect(markup).toContain("earningsModels=owner%2Fmodel%2Bvariant");
});
