import DOMPurify from "dompurify";
import { marked } from "marked";
import { useEffect, useState } from "react";

const App = () => {
    const [content, setContent] = useState<string>("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadContent = async () => {
            try {
                const response = await fetch("/one-pager.md");
                if (response.ok) {
                    const markdown = await response.text();
                    const html = await marked(markdown);
                    setContent(DOMPurify.sanitize(html));
                } else {
                    setContent(
                        '<p class="text-gray-500">Content not found.</p>',
                    );
                }
            } catch {
                setContent(
                    '<p class="text-red-500">Failed to load content.</p>',
                );
            }
            setLoading(false);
        };

        loadContent();
    }, []);

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
            <div className="max-w-4xl mx-auto px-6 py-12 lg:py-16">
                <header className="mb-12 text-center">
                    <h1 className="text-3xl font-bold text-gray-900">
                        myceli
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-500">
                            .ai
                        </span>
                    </h1>
                    <p className="text-gray-500 mt-2">One Pager</p>
                </header>

                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : (
                    <article
                        className="prose prose-gray prose-lg max-w-none prose-headings:font-bold prose-h1:text-3xl prose-h2:text-2xl prose-h3:text-xl prose-a:text-orange-600 prose-a:no-underline hover:prose-a:underline prose-strong:text-gray-800 prose-code:text-orange-600 prose-code:bg-orange-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none"
                        dangerouslySetInnerHTML={{ __html: content }}
                    />
                )}

                <footer className="mt-16 pt-8 border-t border-gray-100 text-center text-sm text-gray-400">
                    <a
                        href="https://myceli.ai"
                        className="hover:text-orange-500 transition-colors"
                    >
                        myceli.ai
                    </a>
                </footer>
            </div>
        </div>
    );
};

export default App;
