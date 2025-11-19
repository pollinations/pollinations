import { useEffect, useState } from "react";

function PrivacyPage() {
    const [content, setContent] = useState("");

    useEffect(() => {
        fetch("/legal/PRIVACY_POLICY.md")
            .then((response) => response.text())
            .then((text) => setContent(text))
            .catch((error) =>
                console.error("Error loading privacy policy:", error)
            );
    }, []);

    return (
        <div className="w-full max-w-4xl mx-auto px-4 py-8 md:py-16">
            <div className="bg-gray-light border-r-8 border-b-8 border-charcoal shadow-charcoal-xl p-8 md:p-16">
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
                                        return `<h1 class="font-headline text-4xl md:text-5xl font-black text-charcoal uppercase tracking-widest mb-8 border-l-8 border-pink pl-4">${line.slice(
                                            2
                                        )}</h1>`;
                                    }
                                    if (line.startsWith("## ")) {
                                        return `<h2 class="font-headline text-2xl md:text-3xl font-black text-charcoal uppercase tracking-widest mt-12 mb-6 border-l-4 border-charcoal pl-4">${line.slice(
                                            3
                                        )}</h2>`;
                                    }
                                    if (line.startsWith("### ")) {
                                        return `<h3 class="font-headline text-xl md:text-2xl font-black text-charcoal uppercase tracking-wider mt-8 mb-4">${line.slice(
                                            4
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
                                            '<a href="$2" class="text-charcoal underline hover:text-pink font-bold transition-colors" target="_blank" rel="noopener noreferrer">$1</a>'
                                        );
                                    }
                                    // Bold
                                    if (line.includes("**")) {
                                        line = line.replace(
                                            /\*\*([^*]+)\*\*/g,
                                            '<strong class="font-bold text-charcoal">$1</strong>'
                                        );
                                    }
                                    // Horizontal rule
                                    if (line.trim() === "---") {
                                        return '<hr class="my-8 border-t-2 border-gray-medium"/>';
                                    }
                                    // Blockquote
                                    if (line.startsWith(">")) {
                                        return `<blockquote class="border-l-4 border-pink pl-4 my-4 text-gray-dark italic">${line
                                            .slice(1)
                                            .trim()}</blockquote>`;
                                    }
                                    // List items
                                    if (line.trim().startsWith("- ")) {
                                        return `<li class="ml-6 mb-2 text-gray-dark font-body text-sm leading-relaxed">${line
                                            .trim()
                                            .slice(2)}</li>`;
                                    }
                                    // Paragraphs
                                    if (line.trim()) {
                                        return `<p class="mb-4 text-gray-dark font-body text-sm leading-relaxed">${line}</p>`;
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

export default PrivacyPage;
