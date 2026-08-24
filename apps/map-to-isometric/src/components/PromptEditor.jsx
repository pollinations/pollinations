import React from "react";
import "../styles/PromptEditor.css";

function PromptEditor({ prompt, setPrompt, onGenerate, isLoading, error }) {
    return (
        <section className="prompt-section">
            <label htmlFor="prompt-input">
                <strong>Customize Your Isometric Style:</strong>
            </label>
            <textarea
                id="prompt-input"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows="3"
                placeholder="Describe the isometric style you want..."
                disabled={isLoading}
            />

            <button
                onClick={onGenerate}
                disabled={isLoading}
                className="generate-button"
            >
                {isLoading
                    ? "⏳ Generating... (30-60 seconds)"
                    : "✨ Generate Isometric View"}
            </button>

            {error && <p className="error-message">❌ {error}</p>}

            <div className="api-info">
                <p>🔧 Powered by Pollinations AI</p>
                <p>⏱️ Generation takes 30-60 seconds - please be patient!</p>
            </div>
        </section>
    );
}

export default PromptEditor;
