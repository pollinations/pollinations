import "../styles/LoadingSpinner.css";

function LoadingSpinner() {
    return (
        <div className="loading-section">
            <div className="loading-spinner"></div>
            <p className="loading-text">
                🎨 Creating your isometric masterpiece...
                <br />
                This may take 30-60 seconds
                <br />
                <span className="loading-subtext">Using Pollinations AI</span>
            </p>
        </div>
    );
}

export default LoadingSpinner;
