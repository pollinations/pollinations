import {
    isCommunityProviderIconPreset,
    sanitizeCommunityProviderSvg,
} from "@shared/community-provider-profile.ts";
import { expect, test } from "vitest";
import {
    getModelBrandLogoPath,
    isSafeCommunityProviderIconUrl,
} from "../frontend/src/components/models/model-info.ts";
import type { ModelPrice } from "../frontend/src/components/models/types.ts";

const VALID_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#000" d="M1 1h22v22H1z"/></svg>';

test("sanitizes a valid publisher SVG by rebuilding an allowlisted tree", () => {
    const result = sanitizeCommunityProviderSvg(VALID_SVG);

    expect(result).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(result).toContain("<path");
    expect(result).toContain('fill="#000"');
    expect(result?.match(/xmlns=/gu)).toHaveLength(1);
});

test.each([
    ["script", '<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>'],
    [
        "event",
        '<svg viewBox="0 0 1 1" onload="alert(1)"><path d="M0 0"/></svg>',
    ],
    [
        "external",
        '<svg viewBox="0 0 1 1"><path fill="url(https://evil.test/x)" d="M0 0"/></svg>',
    ],
    ["doctype", '<!DOCTYPE svg><svg viewBox="0 0 1 1"><path d="M0 0"/></svg>'],
    ["processing instruction", '<?xml version="1.0"?><svg viewBox="0 0 1 1"/>'],
    ["entity", '<svg viewBox="0 0 1 1">&amp;</svg>'],
    ["style", '<svg viewBox="0 0 1 1"><style>.x{fill:red}</style></svg>'],
    ["use", '<svg viewBox="0 0 1 1"><use href="#x"/></svg>'],
    ["href", '<svg viewBox="0 0 1 1"><path href="https://evil.test"/></svg>'],
    [
        "foreign object",
        '<svg viewBox="0 0 1 1"><foreignObject><div>x</div></foreignObject></svg>',
    ],
    ["invalid viewBox", '<svg viewBox="0 0 0 1"><path d="M0 0"/></svg>'],
] as const)("rejects unsafe %s SVG", (_name, input) => {
    expect(sanitizeCommunityProviderSvg(input)).toBeNull();
});

test("resolves custom, preset, and generic community icons safely", () => {
    const custom = {
        community: true,
        brandIconPreset: "openai",
        brandIconUrl: "/api/community-icons/user_1.svg",
    } as ModelPrice;
    expect(getModelBrandLogoPath(custom)).toBe(
        "/api/community-icons/user_1.svg",
    );
    expect(
        isSafeCommunityProviderIconUrl("https://tracker.test/icon.svg"),
    ).toBe(false);

    const preset = {
        community: true,
        brandIconPreset: "google",
        brandIconUrl: "/api/community-icons/bad id.svg",
    } as ModelPrice;
    expect(getModelBrandLogoPath(preset)).toBe("/brand-logos/google.svg");
    expect(
        getModelBrandLogoPath({ community: true } as ModelPrice),
    ).toBeUndefined();
});

test("rejects oversized SVG and recognizes only approved presets", () => {
    expect(
        sanitizeCommunityProviderSvg(
            `<svg viewBox="0 0 1 1">${'<path d="M0 0"/>'.repeat(5000)}</svg>`,
        ),
    ).toBeNull();
    expect(isCommunityProviderIconPreset("openai")).toBe(true);
    expect(isCommunityProviderIconPreset("custom")).toBe(false);
});
