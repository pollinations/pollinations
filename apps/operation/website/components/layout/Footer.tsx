import { useState } from "react";

const LandingFooter = () => {
    const [copied, setCopied] = useState(false);

    const handleCopyEmail = () => {
        navigator.clipboard.writeText("hi@myceli.ai");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <footer className="relative bg-white/80 backdrop-blur-sm text-gray-900 transition-all duration-500">
            {/* Gradient border at top */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 animate-pulse"></div>

            <div className="container mx-auto px-6 md:px-8 lg:px-12 py-8">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    {/* Company Logo and Details */}
                    <div className="flex items-start space-x-3">
                        <img
                            src="/myceli-ai-logo.png"
                            alt="myceli.ai Logo"
                            className="w-6 h-6 mt-0.5"
                        />
                        <div className="text-sm text-gray-500 space-y-1">
                            <p className="text-gray-600 font-medium">
                                © {new Date().getFullYear()} Myceli.ai OÜ. All
                                rights reserved.
                            </p>
                            <p className="flex items-center">
                                <span className="inline-block w-1.5 h-1.5 bg-green-400 rounded-full mr-2 animate-pulse"></span>
                                Registry Code: 17186693 | VAT: EE102877908
                            </p>
                            <p className="flex items-center">
                                <span
                                    className="inline-block w-1.5 h-1.5 bg-blue-400 rounded-full mr-2 animate-pulse"
                                    style={{ animationDelay: "0.5s" }}
                                ></span>
                                Tallinn, Estonia 🇪🇪
                            </p>
                        </div>
                    </div>

                    {/* Contact Button */}
                    <button
                        type="button"
                        onClick={handleCopyEmail}
                        className={`group px-6 py-3 text-sm font-semibold rounded-2xl border backdrop-blur-sm transition-all duration-300 shadow-md hover:shadow-lg hover:scale-105 ${
                            copied
                                ? "text-white bg-gradient-to-r from-green-500 to-emerald-500 border-green-400/50"
                                : "text-gray-700 bg-white border-gray-200 hover:border-orange-300 hover:bg-gradient-to-r hover:from-amber-500 hover:via-orange-500 hover:to-red-500 hover:text-white"
                        }`}
                    >
                        <span className="flex items-center">
                            {copied ? (
                                <>
                                    <svg
                                        className="w-4 h-4 mr-2"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                        aria-hidden="true"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M5 13l4 4L19 7"
                                        />
                                    </svg>
                                    Copied!
                                </>
                            ) : (
                                <>
                                    <svg
                                        className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                        aria-hidden="true"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                                        />
                                    </svg>
                                    hi@myceli.ai
                                </>
                            )}
                        </span>
                    </button>
                </div>
            </div>
        </footer>
    );
};

export default LandingFooter;
