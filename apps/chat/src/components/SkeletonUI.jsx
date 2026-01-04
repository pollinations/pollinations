import "./SkeletonUI.css";

const SkeletonMessage = ({ isUser = false }) => {
    return (
        <div className={`skeleton-message ${isUser ? "user" : "assistant"}`}>
            <div className="skeleton-avatar"></div>
            <div className="skeleton-content">
                <div className="skeleton-line"></div>
                <div className="skeleton-line short"></div>
                <div className="skeleton-line"></div>
            </div>
        </div>
    );
};

const _SkeletonChat = () => {
    return (
        <div className="skeleton-chat">
            <div className="skeleton-header">
                <div className="skeleton-header-left">
                    <div className="skeleton-button"></div>
                    <div className="skeleton-model-selector">
                        <div className="skeleton-line short"></div>
                    </div>
                </div>
                <div className="skeleton-header-right">
                    <div className="skeleton-button"></div>
                    <div className="skeleton-button"></div>
                    <div className="skeleton-button"></div>
                </div>
            </div>

            <div className="skeleton-messages">
                <SkeletonMessage />
                <SkeletonMessage isUser={true} />
                <SkeletonMessage />
                <SkeletonMessage isUser={true} />
                <SkeletonMessage />
            </div>

            <div className="skeleton-input">
                <div className="skeleton-textarea"></div>
                <div className="skeleton-send-button"></div>
            </div>
        </div>
    );
};

export default SkeletonUI;
