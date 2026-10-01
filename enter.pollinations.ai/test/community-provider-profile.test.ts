import { isCommunityProviderIconUrl } from "@shared/community-provider-icon.ts";
import { ModelInfoSchema } from "@shared/registry/model-info.ts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { getModelPricesFromCatalog } from "../frontend/src/components/models/model-catalog.ts";
import {
    getCommunityModelIcon,
    ModelBrandIcon,
} from "../frontend/src/components/models/model-icons.tsx";
import { getModelBrandLogoPath } from "../frontend/src/components/models/model-info.ts";
import type { ModelPrice } from "../frontend/src/components/models/types.ts";

const VALID_ICON_URL =
    "https://media.pollinations.ai/123e4567-e89b-12d3-a456-426614174000";

test("accepts canonical media object URLs and rejects other origins or paths", () => {
    expect(isCommunityProviderIconUrl(VALID_ICON_URL)).toBe(true);
    expect(
        isCommunityProviderIconUrl(
            `https://media.pollinations.ai/${"a".repeat(195)}`,
        ),
    ).toBe(true);
    expect(
        isCommunityProviderIconUrl(
            `https://media.pollinations.ai/u_${"a".repeat(64)}_my_icon.svg`,
        ),
    ).toBe(true);

    for (const value of [
        null,
        undefined,
        "",
        "https://tracker.test/icon.svg",
        "http://media.pollinations.ai/icon.svg",
        "https://user@media.pollinations.ai/icon.svg",
        "https://user:password@media.pollinations.ai/icon.svg",
        "https://media.pollinations.ai:443/icon.svg",
        "https://MEDIA.POLLINATIONS.AI/icon.svg",
        "https://media.pollinations.ai.evil.test/icon.svg",
        "https://media.pollinations.ai/icon.svg?redirect=https://evil.test",
        "https://media.pollinations.ai/icon.svg#fragment",
        "https://media.pollinations.ai/a/b",
        "https://media.pollinations.ai/a%2Fb",
        "https://media.pollinations.ai/a\\b",
        `https://media.pollinations.ai/${"a".repeat(196)}`,
    ]) {
        expect(isCommunityProviderIconUrl(value)).toBe(false);
    }
});

test("model metadata accepts only canonical media icon URLs", () => {
    expect(
        ModelInfoSchema.shape.brand_icon_url.safeParse(VALID_ICON_URL).success,
    ).toBe(true);
    expect(
        ModelInfoSchema.shape.brand_icon_url.safeParse(
            "https://tracker.test/icon.svg",
        ).success,
    ).toBe(false);
});

test("catalog uses the direct media URL and falls back for unsafe icon metadata", () => {
    expect(
        getModelBrandLogoPath({
            community: true,
            brandIconUrl: VALID_ICON_URL,
        } as ModelPrice),
    ).toBe(VALID_ICON_URL);
    const [unsafeModel] = getModelPricesFromCatalog([
        {
            name: "owner/model",
            category: "text",
            community: true,
            brand_icon_url: "https://tracker.test/icon.svg",
        },
    ]);
    expect(getModelBrandLogoPath(unsafeModel)).toBeUndefined();
    expect(
        getModelBrandLogoPath({ community: true } as ModelPrice),
    ).toBeUndefined();
});

test("community models keep a generic icon when no custom URL is set", () => {
    expect(
        getCommunityModelIcon({ community: true, type: "text" } as ModelPrice),
    ).toBeDefined();
    expect(
        getCommunityModelIcon({ community: true, type: "image" } as ModelPrice),
    ).toBeDefined();
    expect(
        getCommunityModelIcon({ community: true, type: "audio" } as ModelPrice),
    ).toBeDefined();
    expect(
        getCommunityModelIcon({ community: false, type: "text" } as ModelPrice),
    ).toBeUndefined();
});

test("custom brand icons render only the mask, without a generic icon underneath", () => {
    const html = renderToStaticMarkup(
        createElement(ModelBrandIcon, {
            model: {
                community: true,
                type: "text",
                brandIconUrl: VALID_ICON_URL,
            } as ModelPrice,
        }),
    );
    expect(html).toContain(`mask-image:url(${VALID_ICON_URL})`);
    expect(html).toContain("bg-current");
    expect(html).not.toContain("<svg");
});

test("generic brand icons have no solid background on desktop or mobile", () => {
    for (const className of [undefined, "h-8 w-8 shrink-0 opacity-55"]) {
        const html = renderToStaticMarkup(
            createElement(ModelBrandIcon, {
                model: { community: true, type: "text" } as ModelPrice,
                className,
            }),
        );
        expect(html).toContain("<svg");
        expect(html).not.toContain("bg-current");
    }
});
