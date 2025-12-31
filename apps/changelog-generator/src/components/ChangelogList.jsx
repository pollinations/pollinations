import dayjs from "dayjs";
import { Calendar, Tag } from "lucide-react";
import React, { useState } from "react";

const ChangelogList = ({ entries }) => {
    const [groupBy, setGroupBy] = useState("date");

    const getCategoryLabel = (category) => {
        const labels = {
            feat: "Features",
            fix: "Bug Fixes",
            docs: "Documentation",
            style: "Styling",
            refactor: "Refactoring",
            test: "Tests",
            chore: "Chores",
            other: "Other",
        };
        return labels[category] || "Other";
    };

    const getCategoryColor = (category) => {
        const colors = {
            feat: "bg-emerald-100 text-emerald-700 border border-emerald-200",
            fix: "bg-rose-100 text-rose-700 border border-rose-200",
            docs: "bg-sky-100 text-sky-700 border border-sky-200",
            style: "bg-fuchsia-100 text-fuchsia-700 border border-fuchsia-200",
            refactor: "bg-amber-100 text-amber-700 border border-amber-200",
            test: "bg-violet-100 text-violet-700 border border-violet-200",
            chore: "bg-slate-100 text-slate-700 border border-slate-200",
            other: "bg-gray-100 text-gray-700 border border-gray-200",
        };
        return colors[category] || colors.other;
    };

    const groupedEntries = React.useMemo(() => {
        if (groupBy === "date") {
            const grouped = {};
            entries.forEach((entry) => {
                const date = dayjs(entry.date).format("YYYY-MM-DD");
                if (!grouped[date]) {
                    grouped[date] = [];
                }
                grouped[date].push(entry);
            });
            return grouped;
        } else {
            const grouped = {};
            entries.forEach((entry) => {
                const category = entry.category || "other";
                if (!grouped[category]) {
                    grouped[category] = [];
                }
                grouped[category].push(entry);
            });
            return grouped;
        }
    }, [entries, groupBy]);

    if (entries.length === 0) {
        return null;
    }

    return (
        <div className="w-full max-w-4xl mx-auto mt-8">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-slate-800">
                    Generated Changelog
                </h2>

                <div className="flex gap-2">
                    <button
                        onClick={() => setGroupBy("date")}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                            groupBy === "date"
                                ? "bg-blue-600 text-white"
                                : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                        }`}
                    >
                        <Calendar size={18} />
                        By Date
                    </button>
                    <button
                        onClick={() => setGroupBy("category")}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                            groupBy === "category"
                                ? "bg-blue-600 text-white"
                                : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                        }`}
                    >
                        <Tag size={18} />
                        By Category
                    </button>
                </div>
            </div>

            <div className="space-y-6">
                {Object.entries(groupedEntries).map(([key, items]) => (
                    <div
                        key={key}
                        className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden"
                    >
                        <div className="bg-slate-50 px-6 py-3 border-b border-slate-200">
                            <h3 className="font-semibold text-slate-800">
                                {groupBy === "date"
                                    ? dayjs(key).format("MMMM D, YYYY")
                                    : getCategoryLabel(key)}
                            </h3>
                        </div>

                        <ul className="divide-y divide-slate-100">
                            {items.map((entry) => (
                                <li
                                    key={entry.sha}
                                    className="px-6 py-4 hover:bg-slate-50 transition-colors"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="flex-1">
                                            <p className="text-slate-800 leading-relaxed text-base">
                                                {entry.changelog}
                                            </p>
                                            <div className="flex items-center gap-3 mt-2 text-sm text-slate-500">
                                                <span>{entry.author}</span>
                                                <span>•</span>
                                                <span>
                                                    {dayjs(entry.date).format(
                                                        "MMM D, YYYY",
                                                    )}
                                                </span>
                                                {groupBy === "date" && (
                                                    <>
                                                        <span>•</span>
                                                        <span
                                                            className={`px-2.5 py-1 rounded-md text-xs font-semibold ${getCategoryColor(
                                                                entry.category,
                                                            )}`}
                                                        >
                                                            {getCategoryLabel(
                                                                entry.category,
                                                            )}
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ChangelogList;
