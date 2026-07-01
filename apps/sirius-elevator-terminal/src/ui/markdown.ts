// Render assistant markdown to ANSI for the terminal. Personas occasionally use
// **bold**, emoji, and short lists; marked-terminal turns that into styled text.

import { marked } from "marked";
import { markedTerminal } from "marked-terminal";

// biome-ignore lint/suspicious/noExplicitAny: marked-terminal's typings lag marked v11's extension shape
marked.use(markedTerminal({ reflowText: true, width: 72 }) as any);

export function renderMarkdown(text: string): string {
    try {
        // marked returns a trailing newline; trim it so lines pack tightly.
        return (marked.parse(text) as string).trimEnd();
    } catch {
        return text;
    }
}
