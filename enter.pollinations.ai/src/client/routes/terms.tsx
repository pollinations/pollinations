import { createFileRoute } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import termsMarkdown from "../../../TERMS_OF_SERVICE.md?raw";
import privacyMarkdown from "../../../PRIVACY_POLICY.md?raw";

export const Route = createFileRoute("/terms")({
    component: TermsComponent,
});

function TermsComponent() {
    const proseClasses = "prose prose-lg prose-slate max-w-none prose-headings:font-bold prose-headings:text-gray-900 prose-h1:text-4xl prose-h1:text-center prose-h1:mb-6 prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4 prose-h2:border-b prose-h2:border-gray-200 prose-h2:pb-2 prose-h3:text-xl prose-h3:mt-6 prose-h3:mb-3 prose-p:text-gray-700 prose-p:mb-3 prose-p:leading-normal prose-ul:my-3 prose-ul:list-disc prose-ul:pl-8 prose-li:text-gray-700 prose-li:mb-1 prose-li:leading-normal prose-strong:text-gray-900 prose-strong:font-semibold prose-em:text-gray-600 prose-em:text-center prose-em:block prose-em:mb-6 prose-em:text-lg prose-blockquote:border-l-4 prose-blockquote:border-blue-500 prose-blockquote:bg-blue-50 prose-blockquote:py-3 prose-blockquote:px-4 prose-blockquote:my-4 prose-blockquote:not-italic prose-a:text-blue-600 prose-a:underline hover:prose-a:text-blue-800 prose-hr:my-8 prose-hr:border-gray-300";
    
    return (
        <div className="min-h-screen py-12 px-4">
            {/* Centered Logo */}
            <div className="flex justify-center mb-12">
                <img
                    src="/logo_text_black.svg"
                    alt="pollinations.ai"
                    className="h-16 sm:h-20 max-w-[90%] invert"
                />
            </div>

            <div className="max-w-4xl mx-auto space-y-8">
                {/* Terms of Service Container */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-6 py-8 sm:px-8 sm:py-10">
                    <div className={proseClasses}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {termsMarkdown}
                        </ReactMarkdown>
                    </div>
                </div>
                
                {/* Privacy Policy Container */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-6 py-8 sm:px-8 sm:py-10">
                    <div className={proseClasses}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {privacyMarkdown}
                        </ReactMarkdown>
                    </div>
                </div>
            </div>

            {/* Contact Us - Outside cards, centered */}
            <div className="text-center mt-12 mb-8">
                <p className="text-gray-700 text-lg">
                    For any inquiries, please contact: <a href="mailto:hello@pollinations.ai" className="text-blue-600 font-semibold hover:underline">hello@pollinations.ai</a>
                </p>
            </div>
        </div>
    );
}
