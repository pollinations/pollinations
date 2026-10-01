import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MediaModelDetails, MediaModelOption } from "./MediaModelDetails";
import type { MediaModelMetadata } from "./media-model-settings";

const empty: MediaModelMetadata = {
    resolutions: [],
    allowedDurations: [],
    videoCapabilities: [],
};

describe("quiet model dropdown facts", () => {
    it("renders nothing when discovery does not publish relevant facts", () => {
        expect(renderToStaticMarkup(<MediaModelDetails model={empty} />)).toBe(
            "",
        );
    });

    it("shows declared numeric limits with accessible labels, not generic capabilities or tooltips", () => {
        const html = renderToStaticMarkup(
            <MediaModelDetails
                model={{
                    ...empty,
                    resolutions: ["480p", "1080p"],
                    allowedDurations: [4, 6, 8],
                    maxReferenceImages: 2,
                    videoCapabilities: ["audio_output"],
                }}
            />,
        );
        for (const label of [
            "Resolutions: 480p, 1080p",
            "Durations: 4, 6, 8 seconds",
            "Up to 2 reference images",
            "Supports generated audio",
        ])
            expect(html).toContain(`aria-label="${label}"`);
        expect(html).toContain("480P / 1080P");
        expect(html).toContain("4–8");
        expect(html).toContain("≤2");
        expect(html).not.toMatch(
            /title=|<button|Accepts|Produces|Works with any Pollen/,
        );
    });

    it("distinguishes fixed duration from an unknown/default-only duration", () => {
        const fixed = renderToStaticMarkup(
            <MediaModelDetails
                model={{ ...empty, minDuration: 5, maxDuration: 5 }}
            />,
        );
        expect(fixed).toContain('aria-label="Fixed duration: 5 seconds"');
        expect(fixed).not.toContain("5–5");
        expect(
            renderToStaticMarkup(
                <MediaModelDetails model={{ ...empty, defaultDuration: 5 }} />,
            ),
        ).toBe("");
    });

    it.each([
        [true, "Paid Pollen required", "polli-wallet-text-paid"],
        [false, "Works with Paid or Quest Pollen", "polli-wallet-text-tier"],
    ] as const)("keeps %s access colored beside the name", (paidOnly, label, color) => {
        const html = renderToStaticMarkup(
            <MediaModelOption
                model={{ ...empty, title: "Example model", paidOnly }}
            />,
        );
        expect(html).toContain(`aria-label="${label}"`);
        expect(html).toContain(color);
        expect(html).toContain(
            "inline-flex min-w-0 max-w-full items-center gap-2",
        );
        expect(html).not.toMatch(
            /title=|Resolutions:|Duration:|generated audio|reference images/,
        );
    });

    it("does not invent a payment type when the catalog omits it", () => {
        const html = renderToStaticMarkup(
            <MediaModelOption model={{ ...empty, title: "Example model" }} />,
        );
        expect(html).toContain("Example model");
        expect(html).not.toContain("Pollen");
    });
});
