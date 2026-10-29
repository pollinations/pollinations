import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { OUTAGE_MESSAGE, OutageNotice } from "./OutageNotice.tsx";

describe("OutageNotice", () => {
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
