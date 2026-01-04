import dayjs from "dayjs";
import { Download } from "lucide-react";

const ExportButton = ({ entries, repoName }) => {
    const generateMarkdown = () => {
        let markdown = `# Changelog - ${repoName}\n\n`;
        markdown += `Generated on ${dayjs().format("MMMM D, YYYY")}\n\n`;

        const categories = {
            feat: [],
            fix: [],
            docs: [],
            style: [],
            refactor: [],
            test: [],
            chore: [],
            other: [],
        };

        entries.forEach((entry) => {
            categories[entry.category || "other"].push(entry);
        });

        const categoryLabels = {
            feat: "✨ Features",
            fix: "🐛 Bug Fixes",
            docs: "📚 Documentation",
            style: "💎 Styling",
            refactor: "♻️ Refactoring",
            test: "🧪 Tests",
            chore: "🔧 Chores",
            other: "📦 Other",
        };

        Object.entries(categories).forEach(([category, items]) => {
            if (items.length > 0) {
                markdown += `## ${categoryLabels[category]}\n\n`;
                items.forEach((item) => {
                    markdown += `- ${item.changelog} (${dayjs(item.date).format("MMM D, YYYY")})\n`;
                });
                markdown += "\n";
            }
        });

        return markdown;
    };

    const generateText = () => {
        let text = `Changelog - ${repoName}\n`;
        text += `Generated on ${dayjs().format("MMMM D, YYYY")}\n\n`;
        text += `${"=".repeat(50)}\n\n`;

        const categories = {
            feat: [],
            fix: [],
            docs: [],
            style: [],
            refactor: [],
            test: [],
            chore: [],
            other: [],
        };

        entries.forEach((entry) => {
            categories[entry.category || "other"].push(entry);
        });

        const categoryLabels = {
            feat: "FEATURES",
            fix: "BUG FIXES",
            docs: "DOCUMENTATION",
            style: "STYLING",
            refactor: "REFACTORING",
            test: "TESTS",
            chore: "CHORES",
            other: "OTHER",
        };

        Object.entries(categories).forEach(([category, items]) => {
            if (items.length > 0) {
                text += `${categoryLabels[category]}\n`;
                text += `${"-".repeat(50)}\n`;
                items.forEach((item) => {
                    text += `• ${item.changelog} (${dayjs(item.date).format("MMM D, YYYY")})\n`;
                });
                text += "\n";
            }
        });

        return text;
    };

    const handleExport = (format) => {
        const content =
            format === "markdown" ? generateMarkdown() : generateText();
        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `changelog-${repoName.replace("/", "-")}.${format === "markdown" ? "md" : "txt"}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    if (entries.length === 0) {
        return null;
    }

    return (
        <div className="w-full max-w-4xl mx-auto mt-6 flex justify-end gap-3">
            <button
                onClick={() => handleExport("text")}
                className="px-4 py-2 bg-slate-600 text-white rounded-lg font-medium hover:bg-slate-700 transition-colors flex items-center gap-2"
            >
                <Download size={18} />
                Export as Text
            </button>
            <button
                onClick={() => handleExport("markdown")}
                className="px-4 py-2 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-900 transition-colors flex items-center gap-2"
            >
                <Download size={18} />
                Export as Markdown
            </button>
        </div>
    );
};

export default ExportButton;
