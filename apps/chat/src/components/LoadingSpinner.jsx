import "./LoadingSpinner.css";

const LoadingSpinner = ({ size = "medium", message = "" }) => {
    const sizeClasses = {
        small: "loading-spinner-small",
        medium: "loading-spinner-medium",
        large: "loading-spinner-large",
    };

    return (
        <div className="loading-spinner-container">
            <div className={`loading-spinner ${sizeClasses[size]}`}>
                <div className="loading-spinner-ring"></div>
                <div className="loading-spinner-ring"></div>
                <div className="loading-spinner-ring"></div>
                <div className="loading-spinner-ring"></div>
            </div>
            {message && <div className="loading-message">{message}</div>}
        </div>
    );
};

export default LoadingSpinner;
