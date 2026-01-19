import { createFileRoute, Link } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import refundsMarkdown from "../../../legal/REFUNDS_AND_CANCELLATIONS.md?raw";

export const Route = createFileRoute("/refunds")({
    component: RefundsComponent,
});

function RefundsComponent() {
    const proseClasses =
        "prose prose-lg prose-slate max-w-none prose-headings:font-semibold prose-headings:text-gray-900 prose-h1:text-2xl prose-h1:font-bold prose-h1:not-italic prose-h1:mb-2 prose-h1:font-body prose-h1:text-center prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4 prose-h2:border-b prose-h2:border-gray-200 prose-h2:pb-2 prose-h3:text-xl prose-h3:mt-6 prose-h3:mb-3 prose-p:text-gray-700 prose-p:mb-3 prose-p:leading-normal prose-ul:my-3 prose-ul:list-disc prose-ul:pl-8 prose-li:text-gray-700 prose-li:mb-1 prose-li:leading-normal prose-strong:text-gray-900 prose-strong:font-semibold prose-em:text-gray-400 prose-em:text-center prose-em:block prose-em:mb-6 prose-em:text-sm prose-em:font-normal prose-blockquote:border-l-4 prose-blockquote:border-blue-500 prose-blockquote:bg-blue-50 prose-blockquote:py-3 prose-blockquote:px-4 prose-blockquote:my-4 prose-blockquote:not-italic prose-a:text-blue-600 prose-a:underline hover:prose-a:text-blue-800 prose-hr:my-8 prose-hr:border-gray-300";

    return (
        <div className="min-h-screen py-12 px-4">
            {/* Header with logo left, nav right */}
            <div className="max-w-4xl mx-auto mb-8 flex justify-between items-center">
                <Link
                    to="/"
                    className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
                >
                    <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 19l-7-7m0 0l7-7m-7 7h18"
                        />
                    </svg>
                    <img
                        src="/logo.svg"
                        alt="pollinations.ai"
                        className="h-6 brightness-0"
                    />
                </Link>
                <div className="flex items-center gap-2 text-sm">
                    <Link
                        to="/terms"
                        className="text-gray-500 hover:text-gray-700 hover:underline"
                    >
                        Terms
                    </Link>
                    <span className="text-gray-400">·</span>
                    <Link
                        to="/privacy"
                        className="text-gray-500 hover:text-gray-700 hover:underline"
                    >
                        Privacy
                    </Link>
                    <span className="text-gray-400">·</span>
                    <span className="font-semibold text-gray-900 underline">
                        Refunds
                    </span>
                </div>
            </div>
            <div className="max-w-4xl mx-auto">
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-6 py-8 sm:px-8 sm:py-10">
                    <div className={proseClasses}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {refundsMarkdown}
                        </ReactMarkdown>
                    </div>
                </div>
            </div>

            {/* Company Information */}
            <div className="text-center mt-12 mb-8 text-gray-600">
                <div className="flex items-center justify-center gap-3 mb-2">
                    <img
                        src="/myceli-ai-logo.svg"
                        alt="Myceli.AI"
                        className="h-6"
                    />
                    <strong className="text-gray-800">Myceli.AI OÜ</strong>
                </div>
                <p className="text-sm leading-relaxed">
                    Registry code: 17186693 · VAT ID: EE102877908
                    <br />
                    Registered address: Tornimäe tn 5, 10145 Tallinn, Estonia
                    <br />
                    Contact:{" "}
                    <a
                        href="mailto:hi@myceli.ai"
                        className="text-blue-600 hover:underline"
                    >
                        hi@myceli.ai
                    </a>
                    <br />
                    Supervisory authority: Estonian Data Protection Inspectorate
                </p>
            </div>
        </div>
    );
}
