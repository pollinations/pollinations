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

    test("links the status page only when there is one", () => {
        expect(renderToStaticMarkup(<OutageNotice />)).not.toContain("<a");
        expect(
            renderToStaticMarkup(
                <OutageNotice statusUrl="https://status.example" />,
            ),
        ).toContain('href="https://status.example"');
    });
});
