import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import ChatInput from "./ChatInput.jsx";

it("shows the catalog title for a selected legacy alias", () => {
    const html = renderToStaticMarkup(
        createElement(ChatInput, {
            selectedModel: "openai",
            models: {
                "openai/gpt-5.4-nano": {
                    id: "openai/gpt-5.4-nano",
                    name: "GPT-5.4 Nano",
                    aliases: ["openai"],
                },
            },
        }),
    );
    expect(html).toContain("GPT-5.4 Nano");
});
