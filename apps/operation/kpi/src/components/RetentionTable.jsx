export function RetentionTable({ data, title }) {
    const getColorClass = (value) => {
        if (value >= 50) return "bg-green-500/30 text-green-400";
        if (value >= 30) return "bg-yellow-500/30 text-yellow-400";
        if (value >= 10) return "bg-orange-500/30 text-orange-400";
        return "bg-red-500/30 text-red-400";
    };

    return (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
            <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-gray-400 border-b border-gray-700">
                            <th className="text-left py-2 px-3">Cohort</th>
                            <th className="text-center py-2 px-3">Users</th>
                            <th className="text-center py-2 px-3">W1</th>
                            <th className="text-center py-2 px-3">W2</th>
                            <th className="text-center py-2 px-3">W3</th>
                            <th className="text-center py-2 px-3">W4</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((row) => (
                            <tr
                                key={row.cohort}
                                className="border-b border-gray-800"
                            >
                                <td className="py-2 px-3 text-white font-medium">
                                    {row.cohort}
                                </td>
                                <td className="py-2 px-3 text-center text-gray-300">
                                    {row.users}
                                </td>
                                {["w1", "w2", "w3", "w4"].map((weekKey) => {
                                    const val = row[weekKey];
                                    return (
                                        <td
                                            key={weekKey}
                                            className="py-2 px-3 text-center"
                                        >
                                            {val != null &&
                                            !Number.isNaN(val) ? (
                                                <span
                                                    className={`px-2 py-1 rounded ${getColorClass(val)}`}
                                                >
                                                    {val.toFixed(0)}%
                                                </span>
                                            ) : (
                                                <span className="text-gray-600">
                                                    —
                                                </span>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
