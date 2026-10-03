import { useEffect, useRef, useState } from "react";
import { type AgentModel, fetchAgentModels } from "./piConfig";
import { runPi } from "./piSandbox";

const DEFAULT_MODEL = "openai/gpt-6-sol";
const DEFAULT_PROMPT =
    "Create fizzbuzz.py that prints FizzBuzz for 1 to 20, then run it.";

type Status = "idle" | "running" | "done" | "error";

export function App() {
    const [models, setModels] = useState<AgentModel[]>([]);
    const [modelsError, setModelsError] = useState<string | null>(null);
    const [apiKey, setApiKey] = useState("");
    const [model, setModel] = useState(DEFAULT_MODEL);
    const [wispUrl, setWispUrl] = useState("");
    const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
    const [status, setStatus] = useState<Status>("idle");
    const [progress, setProgress] = useState("");
    const [output, setOutput] = useState("");
    const [files, setFiles] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);
    const outputRef = useRef<HTMLPreElement>(null);

    useEffect(() => {
        fetchAgentModels()
            .then((list) => {
                setModels(list);
                if (
                    list.length > 0 &&
                    !list.some((m) => m.id === DEFAULT_MODEL)
                ) {
                    setModel(list[0].id);
                }
            })
            .catch((err) => setModelsError((err as Error).message));
    }, []);

    useEffect(() => {
        outputRef.current?.scrollTo(0, outputRef.current.scrollHeight);
    }, []);

    const canRun =
        status !== "running" && apiKey.trim() !== "" && wispUrl.trim() !== "";

    async function start() {
        setStatus("running");
        setError(null);
        setOutput("");
        setFiles({});
        setProgress("Downloading wasmer/pi…");

        try {
            const result = await runPi({
                apiKey: apiKey.trim(),
                model,
                models,
                wispUrl: wispUrl.trim(),
                prompt,
                onOutput: (chunk) => {
                    setProgress("");
                    setOutput((prev) => prev + chunk);
                    outputRef.current?.scrollTo(
                        0,
                        outputRef.current.scrollHeight,
                    );
                },
                onPackageProgress: (p) => {
                    if (p.download.percent != null) {
                        setProgress(
                            `${p.phase}… ${Math.round(p.download.percent)}%`,
                        );
                    }
                },
            });
            setFiles(result.files);
            setStatus(result.exitCode === 0 ? "done" : "error");
            if (result.exitCode !== 0) {
                setError(
                    `Pi exited with status ${result.exitCode}. See output above.`,
                );
            }
        } catch (err) {
            setStatus("error");
            setError((err as Error).message);
        } finally {
            setProgress("");
        }
    }

    return (
        <main className="page">
            <h1>Pi in the browser</h1>
            <p className="lede">
                Runs the real{" "}
                <a
                    href="https://github.com/earendil-works/pi"
                    target="_blank"
                    rel="noreferrer"
                >
                    Pi coding agent
                </a>{" "}
                in a{" "}
                <a
                    href="https://github.com/wasmerio/wasmer-sdk"
                    target="_blank"
                    rel="noreferrer"
                >
                    Wasmer
                </a>{" "}
                WASIX sandbox, billed to your own Pollen balance.
            </p>

            <section className="panel">
                <label htmlFor="apiKey">Pollinations API key</label>
                <input
                    id="apiKey"
                    type="password"
                    placeholder="pk_... or sk_..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                />
                <p className="hint">
                    Create one at{" "}
                    <a
                        href="https://enter.pollinations.ai/keys"
                        target="_blank"
                        rel="noreferrer"
                    >
                        enter.pollinations.ai/keys
                    </a>
                    . Kept in memory only; never sent anywhere but Pollinations.
                </p>

                <label htmlFor="model">Model</label>
                <select
                    id="model"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    disabled={models.length === 0}
                >
                    {models.length === 0 && (
                        <option value={model}>{model}</option>
                    )}
                    {models.map((m) => (
                        <option key={m.id} value={m.id}>
                            {m.id}
                        </option>
                    ))}
                </select>
                {modelsError && (
                    <p className="hint error">
                        Couldn't load live models: {modelsError}
                    </p>
                )}

                <label htmlFor="wispUrl">WISP proxy WebSocket URL</label>
                <input
                    id="wispUrl"
                    type="text"
                    placeholder="wss://your-proxy.example/"
                    value={wispUrl}
                    onChange={(e) => setWispUrl(e.target.value)}
                />
                <p className="hint">
                    Browsers can't open raw TCP sockets, so the sandbox needs a{" "}
                    <a
                        href="https://github.com/wasmerio/wasmer-sdk/blob/main/js/README.md#external-browser-connections"
                        target="_blank"
                        rel="noreferrer"
                    >
                        WISP
                    </a>{" "}
                    relay to reach gen.pollinations.ai. Run{" "}
                    <code>wasmer run wasmer/wisp-server --net</code> locally, or
                    deploy it to Wasmer Edge for a public <code>wss://</code>{" "}
                    URL. See the README.
                </p>

                <label htmlFor="prompt">Prompt</label>
                <textarea
                    id="prompt"
                    rows={3}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                />

                <button type="button" onClick={start} disabled={!canRun}>
                    {status === "running" ? "Running…" : "Run Pi"}
                </button>
                {progress && <p className="hint">{progress}</p>}
                {error && <p className="hint error">{error}</p>}
            </section>

            <section className="panel">
                <h2>Output</h2>
                <pre ref={outputRef} className="output">
                    {output || "Pi's output streams here once it starts."}
                </pre>
            </section>

            {Object.keys(files).length > 0 && (
                <section className="panel">
                    <h2>Workspace files</h2>
                    {Object.entries(files).map(([name, content]) => (
                        <details key={name}>
                            <summary>{name}</summary>
                            <pre className="output">{content}</pre>
                        </details>
                    ))}
                </section>
            )}
        </main>
    );
}
