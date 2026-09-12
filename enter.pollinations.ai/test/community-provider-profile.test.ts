import { isCommunityProviderIconUrl } from "@shared/community-provider-icon.ts";
import { ModelInfoSchema } from "@shared/registry/model-info.ts";
import { expect, test } from "vitest";
import { getCommunityModelIcon } from "../frontend/src/components/models/model-icons.tsx";
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
    expect(
        getModelBrandLogoPath({
            community: true,
            brandIconUrl: "https://tracker.test/icon.svg",
        } as ModelPrice),
    ).toBeUndefined();
    expect(
        getModelBrandLogoPath({ community: true } as ModelPrice),
    ).toBeUndefined();
});

test("community models keep a generic icon available when a custom mask is unavailable", () => {
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
