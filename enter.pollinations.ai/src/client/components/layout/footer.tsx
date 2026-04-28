export function Footer() {
    return (
        <div className="mt-4 mx-auto">
            <div className="flex flex-col sm:flex-row justify-center items-center gap-2 sm:gap-3 text-sm text-gray-400">
                <span>© 2026 Myceli.AI</span>
                <span className="hidden sm:inline">·</span>
                <a
                    href="https://pollinations.ai/terms"
                    className="font-medium text-gray-500 hover:text-gray-700 hover:underline transition-colors"
                >
                    Terms
                </a>
                <span className="hidden sm:inline">·</span>
                <a
                    href="https://pollinations.ai/privacy"
                    className="font-medium text-gray-500 hover:text-gray-700 hover:underline transition-colors"
                >
                    Privacy
                </a>
                <span className="hidden sm:inline">·</span>
                <a
                    href="https://pollinations.ai/refunds"
                    className="font-medium text-gray-500 hover:text-gray-700 hover:underline transition-colors"
                >
                    Refunds
                </a>
            </div>
        </div>
    );
}
