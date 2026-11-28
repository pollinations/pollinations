import { expect, it } from "vitest";
import { parseHeading } from "../frontend/src/components/news-faq/faq-heading.ts";

it.each([
    ["🔑 Which key?", ["which-key"]],
    ["🔑 Which key? {#keys}", ["keys"]],
    [
        "🔑 Which key? {#keys #secret-key #app-key}",
        ["keys", "secret-key", "app-key"],
    ],
])("keeps the question and its link targets for %s", (heading, anchors) => {
    expect(parseHeading(heading)).toEqual({
        question: "🔑 Which key?",
        anchors,
    });
});
