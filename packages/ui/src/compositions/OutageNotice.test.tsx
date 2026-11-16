import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, test, vi } from "vitest";
import { OUTAGE_MESSAGE, OutageNotice } from "./OutageNotice.tsx";

describe("OutageNotice", () => {
    afterEach(() => vi.unstubAllGlobals());

    test("says the visitor is offline instead of blaming Pollinations", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        vi.stubGlobal("window", new EventTarget());
        vi.stubGlobal("navigator", { onLine: false });
        let renderer: ReactTestRenderer | undefined;
        await act(async () => {
            renderer = create(<OutageNotice retrying />);
        });
        const text = () => JSON.stringify(renderer?.toJSON());
        expect(text()).toContain("You’re offline.");
        expect(text()).toContain("retries when your connection is back");
        expect(text()).not.toContain("temporary outage");

        vi.stubGlobal("navigator", { onLine: true });
        await act(async () => {
            window.dispatchEvent(new Event("online"));
        });
        expect(text()).toContain("temporary outage");
        await act(async () => renderer?.unmount());
    });

    test("says it retries only when the caller does", () => {
        expect(renderToStaticMarkup(<OutageNotice />)).not.toContain(
            "Retrying automatically.",
        );
        expect(renderToStaticMarkup(<OutageNotice retrying />)).toContain(
            `${OUTAGE_MESSAGE} Retrying automatically.`,
        );
    });

    test("gives the full message once per page; later notices stay short", async () => {
        vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
        vi.stubGlobal("window", new EventTarget());
        vi.stubGlobal("navigator", { onLine: true });
        vi.stubGlobal(
            "Node",
            class {
                static DOCUMENT_POSITION_PRECEDING = 2;
            },
        );
        // Stand-in elements that know their page order.
        let order = 0;
        const createNodeMock = () => {
            const index = order++;
            return {
                index,
                compareDocumentPosition: (other: { index: number }) =>
                    other.index < index ? 2 : 4,
            };
        };
        const page = (showFirst: boolean) => (
            <>
                {showFirst && <OutageNotice retrying />}
                <OutageNotice retrying />
            </>
        );
        let renderer: ReactTestRenderer | undefined;
        await act(async () => {
            renderer = create(page(true), { createNodeMock });
        });
        const text = () => JSON.stringify(renderer?.toJSON());
        expect(text().match(/temporary outage/g)).toHaveLength(1);
        expect(text()).toContain("Unavailable during the outage.");

        await act(async () => renderer?.update(page(false)));
        expect(text()).toContain("temporary outage");
        expect(text()).not.toContain("Unavailable during the outage.");
        await act(async () => renderer?.unmount());
    });

    test("links the status page only when there is one", () => {
        expect(renderToStaticMarkup(<OutageNotice />)).not.toContain("<a");
        expect(
            renderToStaticMarkup(
                <OutageNotice statusUrl="https://status.example" />,
            ),
        ).toContain('href="https://status.example"');
    });
});
