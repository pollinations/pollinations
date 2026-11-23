import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MediaModelOption } from "./MediaModelOption";

describe("model dropdown option", () => {
    it("shows New only during the first seven days after the catalog date", () => {
        const now = Date.UTC(2026, 10, 20);
        const cutoff = Date.UTC(2026, 10, 13);
        const clock = vi.spyOn(Date, "now").mockReturnValue(now);
        try {
            for (const addedDate of [now, cutoff + 1, cutoff, undefined]) {
                const html = renderToStaticMarkup(
                    <MediaModelOption
                        model={{ title: "Test", paidOnly: false, addedDate }}
                    />,
                );
                expect(html.includes(">New</span>")).toBe(
                    addedDate !== undefined && addedDate > cutoff,
                );
            }
        } finally {
            clock.mockRestore();
        }
    });
    it.each([
        [true, "Uses paid balance only", "polli-wallet-text-paid"],
        [false, "Works with any balance", "polli-wallet-text-tier"],
    ] as const)(
        "shows the %s wallet icon after the price",
        (paidOnly, label, color) => {
            const html = renderToStaticMarkup(
                <MediaModelOption
                    model={{
                        title: "Example model",
                        publisher: "OpenAI",
                        paidOnly,
                    }}
                    perDollar="8 gen/$1"
                />,
            );
            expect(html).toContain(`aria-label="${label}"`);
            expect(html).toContain(color);
            expect(html).toContain("mask:");
            expect(html).not.toContain(">OpenAI<");
            expect(html).toMatch(/Example model.*8 gen\/\$1.*role="img"/s);
        },
    );
    it("shows a community agent's uploaded logo, else the agent icon", () => {
        const agent = {
            title: "Agent",
            paidOnly: false,
            category: "text",
            community: true,
            agent: true,
        };
        const logo = "https://media.pollinations.ai/f4747bba-ca12";
        const withLogo = renderToStaticMarkup(
            <MediaModelOption model={{ ...agent, brandIconUrl: logo }} />,
        );
        expect(withLogo).toContain(logo);
        const without = renderToStaticMarkup(
            <MediaModelOption model={agent} />,
        );
        expect(without).toContain("<svg");
        expect(
            renderToStaticMarkup(
                <MediaModelOption
                    model={{
                        ...agent,
                        brandIconUrl: "https://evil.example/x.svg",
                    }}
                />,
            ),
        ).not.toContain("evil.example");
    });
});
