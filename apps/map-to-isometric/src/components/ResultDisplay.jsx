import React from "react";
import "../styles/ResultDisplay.css";

function ResultDisplay({
    generatedImage,
    onDownload,
    onReset,
    onLoadComplete,
    onError,
}) {
    return (
        <section className="result-section">
            <h3>🎉 Your Isometric View</h3>
            <div className="result-box">
                <img
                    src={generatedImage}
                    alt="Generated isometric view"
                    className="result-image"
                    onLoad={onLoadComplete}
                    onError={onError}
                    crossOrigin="anonymous"
                />
            </div>
            <div className="action-buttons">
                <button onClick={onDownload} className="download-button">
                    ⬇️ Download Image
                </button>
                <button onClick={onReset} className="reset-button">
                    🔄 Create Another
                </button>
            </div>
        </section>
    );
}

export default ResultDisplay;
