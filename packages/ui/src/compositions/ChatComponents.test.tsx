import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
    ChatConversation,
    ChatConversationContent,
} from "./ChatConversation.tsx";
import {
    ChatMessage,
    ChatMessageActions,
    ChatMessageContent,
    ChatMessageHeader,
} from "./ChatMessage.tsx";
import {
    ChatPromptInput,
    ChatPromptInputFooter,
    ChatPromptTextarea,
} from "./ChatPromptInput.tsx";

describe("chat compositions", () => {
    it("renders a protocol-neutral conversation and message", () => {
        const html = renderToStaticMarkup(
            <ChatConversation>
                <ChatConversationContent>
                    <ChatMessage from="assistant">
                        <ChatMessageHeader
                            from="assistant"
                            label="Research agent"
                        />
                        <ChatMessageContent>Answer</ChatMessageContent>
                        <ChatMessageActions>Copy</ChatMessageActions>
                    </ChatMessage>
                </ChatConversationContent>
            </ChatConversation>,
        );

        expect(html).toContain('data-role="assistant"');
        expect(html).toContain("Research agent");
        expect(html).toContain("Answer");
        expect(html).toContain("Copy");
    });

    it("composes prompt attachments, text, and actions", () => {
        const html = renderToStaticMarkup(
            <ChatPromptInput aria-label="Message and attachments">
                <span>photo.png</span>
                <ChatPromptTextarea defaultValue="Hello" />
                <ChatPromptInputFooter
                    start={<button type="button">Attach</button>}
                    end={<button type="submit">Send</button>}
                />
            </ChatPromptInput>,
        );

        expect(html).toContain('aria-label="Message and attachments"');
        expect(html).toContain("photo.png");
        expect(html).toContain("Attach");
        expect(html).toContain("Send");
    });
});
