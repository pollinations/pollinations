import { useState } from "react";
import ChangelogList from "./components/ChangelogList";
import ExportButton from "./components/ExportButton";
import RepoInput from "./components/RepoInput";
import { categorizeCommit, fetchCommits } from "./services/gitService";
import { generateChangelogEntry } from "./services/pollinationsService";

function App() {
    const [loading, setLoading] = useState(false);
    const [entries, setEntries] = useState([]);
    const [repoName, setRepoName] = useState("");
    const [error, setError] = useState("");
    const [progress, setProgress] = useState({ current: 0, total: 0 });

    const handleGenerate = async (repo) => {
        setLoading(true);
        setError("");
        setEntries([]);
        setRepoName(repo);
        setProgress({ current: 0, total: 0 });

        try {
            const commits = await fetchCommits(repo);
            setProgress({ current: 0, total: commits.length });

            const changelogEntries = [];

            for (let i = 0; i < commits.length; i++) {
                const commit = commits[i];
                const category = categorizeCommit(commit.message);
                const changelog = await generateChangelogEntry(commit.message);

                changelogEntries.push({
                    ...commit,
                    category,
                    changelog:
                        typeof changelog === "string"
                            ? changelog
                            : commit.message,
                });

                setProgress({ current: i + 1, total: commits.length });
                setEntries([...changelogEntries]);
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
            setProgress({ current: 0, total: 0 });
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            <div className="container mx-auto px-4 py-12">
                <RepoInput onGenerate={handleGenerate} loading={loading} />

                {loading && (
                    <div className="w-full max-w-2xl mx-auto mt-8">
                        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-base font-medium text-slate-700">
                                    Creating your changelog...
                                </span>
                                <span className="text-sm text-slate-600">
                                    {progress.current} / {progress.total}
                                </span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-2">
                                <div
                                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                    style={{
                                        width:
                                            progress.total > 0
                                                ? `${(progress.current / progress.total) * 100}%`
                                                : "0%",
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="w-full max-w-2xl mx-auto mt-8">
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                            <p className="text-red-800 font-medium">{error}</p>
                        </div>
                    </div>
                )}

                <ChangelogList entries={entries} />
                <ExportButton entries={entries} repoName={repoName} />
            </div>
        </div>
    );
}

export default App;
