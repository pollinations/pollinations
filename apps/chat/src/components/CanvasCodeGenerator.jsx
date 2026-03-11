import React, { useState, useRef, useEffect } from "react";
import { getApiToken } from "../utils/api";
import "./CanvasCodeGenerator.css";

const COLOR_SWATCHES = [
    "#000000",
    "#ffffff",
    "#ef4444",
    "#f97316",
    "#eab308",
    "#22c55e",
    "#3b82f6",
    "#a855f7",
    "#ec4899",
];

const CanvasCodeGenerator = ({
    onCodeGenerated,
    onClose,
    initialPrompt = "",
}) => {
    const canvasRef = useRef(null);
    const iframeRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [color, setColor] = useState("#000000");
    const [brushSize, setBrushSize] = useState(5);
    const [isErasing, setIsErasing] = useState(false);
    const [generatedCode, setGeneratedCode] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [activeTab, setActiveTab] = useState("code"); // 'code' | 'preview'
    const [prompt, setPrompt] = useState(initialPrompt);
    const [refinePrompt, setRefinePrompt] = useState("");
    const historyRef = useRef([]);
    const [canUndo, setCanUndo] = useState(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // Auto-generate if opened with a prompt from /code command
        if (initialPrompt.trim()) {
            generateCode();
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Update iframe preview when code changes and preview tab is active
    useEffect(() => {
        if (activeTab === "preview" && iframeRef.current && generatedCode) {
            iframeRef.current.srcdoc = generatedCode;
        }
    }, [activeTab, generatedCode]);

    const saveSnapshot = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        historyRef.current = [
            ...historyRef.current.slice(-19),
            canvas.toDataURL(),
        ];
        setCanUndo(true);
    };

    const undo = () => {
        if (historyRef.current.length === 0) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        const prevDataUrl = historyRef.current[historyRef.current.length - 1];
        historyRef.current = historyRef.current.slice(0, -1);
        setCanUndo(historyRef.current.length > 0);
        const img = new Image();
        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
        };
        img.src = prevDataUrl;
    };

    // Ctrl+Z keyboard shortcut — undo reads historyRef so no stale closure
    useEffect(() => {
        const onKey = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "z") {
                e.preventDefault();
                undo();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const refineCode = async () => {
        if (!refinePrompt.trim() || !generatedCode) return;
        setIsGenerating(true);
        try {
            const apiToken = getApiToken();
            const response = await fetch(
                "https://gen.pollinations.ai/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(apiToken
                            ? { Authorization: `Bearer ${apiToken}` }
                            : {}),
                    },
                    body: JSON.stringify({
                        model: "openai",
                        messages: [
                            {
                                role: "user",
                                content: `Here is an existing HTML page:\n\n\`\`\`html\n${generatedCode}\n\`\`\`\n\nPlease modify it: ${refinePrompt.trim()}\n\nReturn only the complete modified HTML, no explanation.`,
                            },
                        ],
                        max_tokens: 4000,
                    }),
                },
            );
            if (!response.ok) throw new Error(`API error: ${response.status}`);
            const data = await response.json();
            const raw = data.choices?.[0]?.message?.content || "";
            const match = raw.match(/```(?:html)?\s*([\s\S]*?)```/);
            const code = match ? match[1].trim() : raw.trim();
            setGeneratedCode(code);
            setActiveTab("preview");
            setRefinePrompt("");
        } catch (error) {
            console.error("Error refining code:", error);
            if (window?.showToast)
                window.showToast("Error refining: " + error.message, "error");
        } finally {
            setIsGenerating(false);
        }
    };

    const getCanvasPos = (e, canvas) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        };
    };

    const startDrawing = (e) => {
        saveSnapshot();
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        const { x, y } = getCanvasPos(e, canvas);
        ctx.beginPath();
        ctx.moveTo(x, y);
        setIsDrawing(true);
    };

    const draw = (e) => {
        if (!isDrawing) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        const { x, y } = getCanvasPos(e, canvas);
        ctx.lineWidth = isErasing ? brushSize * 3 : brushSize;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = isErasing ? "#ffffff" : color;
        ctx.lineTo(x, y);
        ctx.stroke();
    };

    const stopDrawing = () => setIsDrawing(false);

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    const generateCode = async () => {
        setIsGenerating(true);
        try {
            const canvas = canvasRef.current;
            const dataUrl = canvas.toDataURL("image/png");
            const apiToken = getApiToken();
            const userPrompt =
                prompt.trim() ||
                "Generate a complete, self-contained HTML page with CSS and JavaScript that recreates or is inspired by this sketch/drawing. Return only the HTML code, no explanation.";

            const response = await fetch(
                "https://gen.pollinations.ai/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(apiToken
                            ? { Authorization: `Bearer ${apiToken}` }
                            : {}),
                    },
                    body: JSON.stringify({
                        model: "openai",
                        messages: [
                            {
                                role: "user",
                                content: [
                                    {
                                        type: "image_url",
                                        image_url: { url: dataUrl },
                                    },
                                    { type: "text", text: userPrompt },
                                ],
                            },
                        ],
                        max_tokens: 4000,
                    }),
                },
            );

            if (!response.ok) throw new Error(`API error: ${response.status}`);
            const data = await response.json();
            const raw = data.choices?.[0]?.message?.content || "";
            // Extract code block if wrapped in markdown fences
            const match = raw.match(/```(?:html)?\s*([\s\S]*?)```/);
            const code = match ? match[1].trim() : raw.trim();
            setGeneratedCode(code);
            setActiveTab("preview");
        } catch (error) {
            console.error("Error generating code:", error);
            if (window?.showToast)
                window.showToast(
                    "Error generating code: " + error.message,
                    "error",
                );
        } finally {
            setIsGenerating(false);
        }
    };

    const runPreview = () => {
        if (iframeRef.current) {
            iframeRef.current.srcdoc = generatedCode;
        }
        setActiveTab("preview");
    };

    const insertIntoChat = () => {
        if (onCodeGenerated) onCodeGenerated(generatedCode);
        onClose();
    };

    return (
        <div
            className="canvas-code-generator"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <div className="ccg-modal">
                <div className="ccg-header">
                    <span className="ccg-title">
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            width="18"
                            height="18"
                        >
                            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                            <path d="M14 2v6h6M16 13H8m8 4H8m2-8H8" />
                        </svg>
                        Canvas Code Generator
                    </span>
                    <button
                        className="ccg-close-btn"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            width="18"
                            height="18"
                        >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <div className="ccg-body">
                    {/* Left: Drawing panel */}
                    <div className="ccg-draw-panel">
                        <div className="ccg-draw-toolbar">
                            <div className="ccg-brush-row">
                                <span className="ccg-tool-label">Size</span>
                                <input
                                    type="range"
                                    min="1"
                                    max="24"
                                    value={brushSize}
                                    onChange={(e) =>
                                        setBrushSize(Number(e.target.value))
                                    }
                                />
                                <span className="ccg-brush-val">
                                    {brushSize}
                                </span>
                            </div>

                            <button
                                className={`ccg-tool-btn ${isErasing ? "active" : ""}`}
                                onClick={() => setIsErasing(!isErasing)}
                                title="Eraser"
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    width="16"
                                    height="16"
                                >
                                    <path d="M20 20H7L3 16l10-10 7 7-1.5 1.5" />
                                    <path d="M6.13 15.87L10 12" />
                                </svg>
                            </button>

                            <button
                                className="ccg-tool-btn"
                                onClick={clearCanvas}
                                title="Clear canvas"
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    width="16"
                                    height="16"
                                >
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6l-1 14H6L5 6" />
                                    <path d="M10 11v6m4-6v6" />
                                </svg>
                            </button>
                            <button
                                className="ccg-tool-btn"
                                onClick={undo}
                                disabled={!canUndo}
                                title="Undo (Ctrl+Z)"
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    width="16"
                                    height="16"
                                >
                                    <path d="M3 7v6h6" />
                                    <path d="M3 13C5.5 6.5 14 3.5 21 8" />
                                </svg>
                            </button>
                        </div>

                        {/* Color swatches row */}
                        <div className="ccg-swatch-row">
                            {COLOR_SWATCHES.map((c) => (
                                <button
                                    key={c}
                                    className={`ccg-swatch${
                                        color === c && !isErasing
                                            ? " active"
                                            : ""
                                    }`}
                                    style={{ background: c }}
                                    onClick={() => {
                                        setColor(c);
                                        setIsErasing(false);
                                    }}
                                    title={c}
                                />
                            ))}
                            <span className="ccg-swatch-sep" />
                            <input
                                type="color"
                                className="ccg-custom-color"
                                value={color}
                                onChange={(e) => {
                                    setColor(e.target.value);
                                    setIsErasing(false);
                                }}
                                title="Custom color"
                            />
                        </div>

                        <div className="ccg-canvas-wrap">
                            <canvas
                                ref={canvasRef}
                                width={560}
                                height={420}
                                className={`ccg-canvas ${isErasing ? "eraser-cursor" : ""}`}
                                onMouseDown={startDrawing}
                                onMouseMove={draw}
                                onMouseUp={stopDrawing}
                                onMouseLeave={stopDrawing}
                            />
                        </div>

                        <div className="ccg-prompt-row">
                            <input
                                type="text"
                                className="ccg-prompt-input"
                                placeholder="Optional: describe what to build..."
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                onKeyDown={(e) =>
                                    e.key === "Enter" &&
                                    !isGenerating &&
                                    generateCode()
                                }
                            />
                            <button
                                className="ccg-generate-btn"
                                onClick={generateCode}
                                disabled={isGenerating}
                            >
                                {isGenerating ? (
                                    <>
                                        <svg
                                            className="ccg-spinner"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            width="15"
                                            height="15"
                                        >
                                            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                        </svg>
                                        Generating…
                                    </>
                                ) : (
                                    <>
                                        <svg
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            width="15"
                                            height="15"
                                        >
                                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                                        </svg>
                                        Generate Code
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Right: Code + Preview panel */}
                    <div className="ccg-code-panel">
                        <div className="ccg-tabs">
                            <button
                                className={`ccg-tab ${activeTab === "code" ? "active" : ""}`}
                                onClick={() => setActiveTab("code")}
                            >
                                Code
                            </button>
                            <button
                                className={`ccg-tab ${activeTab === "preview" ? "active" : ""}`}
                                onClick={() => {
                                    setActiveTab("preview");
                                    if (iframeRef.current)
                                        iframeRef.current.srcdoc =
                                            generatedCode;
                                }}
                            >
                                Preview
                            </button>
                            <div className="ccg-tab-spacer" />
                            {generatedCode && (
                                <>
                                    <button
                                        className="ccg-action-btn"
                                        onClick={() =>
                                            navigator.clipboard.writeText(
                                                generatedCode,
                                            )
                                        }
                                        title="Copy code"
                                    >
                                        <svg
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            width="14"
                                            height="14"
                                        >
                                            <rect
                                                x="9"
                                                y="9"
                                                width="13"
                                                height="13"
                                                rx="2"
                                            />
                                            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                                        </svg>
                                        Copy
                                    </button>
                                    <button
                                        className="ccg-action-btn ccg-run-btn"
                                        onClick={runPreview}
                                        title="Run preview"
                                    >
                                        <svg
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            width="14"
                                            height="14"
                                        >
                                            <polygon points="5 3 19 12 5 21 5 3" />
                                        </svg>
                                        Run
                                    </button>
                                    <button
                                        className="ccg-action-btn ccg-insert-btn"
                                        onClick={insertIntoChat}
                                        title="Insert into chat"
                                    >
                                        <svg
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            width="14"
                                            height="14"
                                        >
                                            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                                        </svg>
                                        Insert
                                    </button>
                                </>
                            )}
                        </div>

                        <div className="ccg-editor-area">
                            {activeTab === "code" ? (
                                <textarea
                                    className="ccg-code-editor"
                                    value={generatedCode}
                                    onChange={(e) =>
                                        setGeneratedCode(e.target.value)
                                    }
                                    placeholder="Draw something and click Generate Code, or start typing HTML here..."
                                    spellCheck={false}
                                />
                            ) : (
                                <iframe
                                    ref={iframeRef}
                                    className="ccg-preview-iframe"
                                    sandbox="allow-scripts allow-forms allow-modals"
                                    title="Code Preview"
                                    srcDoc={
                                        generatedCode ||
                                        '<p style="color:#888;font-family:sans-serif;padding:2rem">Preview will appear here after generating code.</p>'
                                    }
                                />
                            )}
                        </div>
                        {generatedCode && (
                            <div className="ccg-refine-row">
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    width="14"
                                    height="14"
                                    className="ccg-refine-icon"
                                >
                                    <path d="M12 20h9" />
                                    <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                                </svg>
                                <input
                                    type="text"
                                    className="ccg-refine-input"
                                    placeholder="Refine: add animations, change colors, add a button…"
                                    value={refinePrompt}
                                    onChange={(e) =>
                                        setRefinePrompt(e.target.value)
                                    }
                                    onKeyDown={(e) =>
                                        e.key === "Enter" &&
                                        !isGenerating &&
                                        refineCode()
                                    }
                                />
                                <button
                                    className="ccg-refine-btn"
                                    onClick={refineCode}
                                    disabled={
                                        isGenerating || !refinePrompt.trim()
                                    }
                                >
                                    {isGenerating ? "Refining…" : "Refine"}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CanvasCodeGenerator;
