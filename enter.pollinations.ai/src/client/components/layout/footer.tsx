import { Link } from "@tanstack/react-router";

export function Footer() {
    return (
        <div className="mt-4 mx-auto">
            <div className="flex flex-col sm:flex-row justify-center items-center gap-2 sm:gap-3 text-sm text-gray-400">
                <span>© 2026 Myceli.AI</span>
                <span className="hidden sm:inline">·</span>
                <Link
                    to="/terms"
                    reloadDocument
                    className="font-medium text-gray-500 hover:text-gray-700 hover:underline transition-colors"
                >
                    Terms
                </Link>
                <span className="hidden sm:inline">·</span>
                <Link
                    to="/privacy"
                    reloadDocument
                    className="font-medium text-gray-500 hover:text-gray-700 hover:underline transition-colors"
                >
                    Privacy
                </Link>
                <span className="hidden sm:inline">·</span>
                <Link
                    to="/refunds"
                    reloadDocument
                    className="font-medium text-gray-500 hover:text-gray-700 hover:underline transition-colors"
                >
                    Refunds
                </Link>
            </div>
        </div>
    );
}
