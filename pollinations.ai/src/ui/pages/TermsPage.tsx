import { useEffect, useState } from "react";

function TermsPage() {
    const [content, setContent] = useState("");

    useEffect(() => {
        fetch("/legal/TERMS_OF_SERVICE.md")
            .then((response) => response.text())
            .then((text) => setContent(text))
            .catch((error) => console.error("Error loading terms:", error));
    }, []);

    return (
        <div className="w-full max-w-4xl mx-auto px-4 py-8 md:py-16">
            <div className="bg-cream border-r-8 border-b-8 border-dark shadow-dark-xl p-8 md:p-16">
                <div className="prose prose-sm md:prose max-w-none">
                    <div
                        className="markdown-content"
                        dangerouslySetInnerHTML={{
                            __html: content
                                .split("\n")
                                .map((line) => {
                                    // Remove emojis
                                    line = line
                                        .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")
                                        .trim();

                                    // Headings
                                    if (line.startsWith("# ")) {
                                        return `<h1 class="font-headline text-xl md:text-2xl font-black text-dark uppercase tracking-widest mb-8 border-l-8 border-dark pl-4">${line.slice(
                                            2,
                                        )}</h1>`;
                                    }
                                    if (line.startsWith("## ")) {
                                        return `<h2 class="font-headline text-base md:text-lg font-black text-dark uppercase tracking-widest mt-12 mb-6 border-l-4 border-dark pl-4">${line.slice(
                                            3,
                                        )}</h2>`;
                                    }
                                    if (line.startsWith("### ")) {
                                        return `<h3 class="font-headline text-sm md:text-base font-black text-dark uppercase tracking-wider mt-8 mb-4">${line.slice(
                                            4,
                                        )}</h3>`;
                                    }
                                    // Links
                                    if (
                                        line.includes("[") &&
                                        line.includes("]")
                                    ) {
                                        const linkRegex =
                                            /\[([^\]]+)\]\(([^)]+)\)/g;
                                        line = line.replace(
                                            linkRegex,
                                            '<a href="$2" class="text-dark underline hover:text-dark font-bold transition-colors" target="_blank" rel="noopener noreferrer">$1</a>',
                                        );
                                    }
                                    // Bold
                                    if (line.includes("**")) {
                                        line = line.replace(
                                            /\*\*([^*]+)\*\*/g,
                                            '<strong class="font-bold text-dark">$1</strong>',
                                        );
                                    }
                                    // Horizontal rule
                                    if (line.trim() === "---") {
                                        return '<hr class="my-8 border-t-2 border-cream"/>';
                                    }
                                    // Blockquote
                                    if (line.startsWith(">")) {
                                        return `<blockquote class="border-l-4 border-dark pl-4 my-4 text-muted italic">${line
                                            .slice(1)
                                            .trim()}</blockquote>`;
                                    }
                                    // List items
                                    if (line.trim().startsWith("- ")) {
                                        return `<li class="ml-6 mb-2 text-muted font-body text-sm leading-relaxed">${line
                                            .trim()
                                            .slice(2)}</li>`;
                                    }
                                    // Paragraphs
                                    if (line.trim()) {
                                        return `<p class="mb-4 text-muted font-body text-sm leading-relaxed">${line}</p>`;
                                    }
                                    return "";
                                })
                                .join("\n"),
                        }}
                    />
                </div>
            </div>
        </div>
    );
}

export default TermsPage;
