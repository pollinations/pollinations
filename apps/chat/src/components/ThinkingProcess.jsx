import { useEffect, useRef, useState } from "react";
import "./ThinkingProcess.css";

const ThinkingProcess = ({ isThinking, content }) => {
    const [elapsed, setElapsed] = useState(0);
    const [isOpen, setIsOpen] = useState(isThinking);
    const startTimeRef = useRef(null);
    const timerRef = useRef(null);

    useEffect(() => {
        if (isThinking) {
            // Start or resume timer
            if (!startTimeRef.current) {
                startTimeRef.current = Date.now() - elapsed * 1000;
            }

            timerRef.current = setInterval(() => {
                setElapsed((Date.now() - startTimeRef.current) / 1000);
            }, 100);

            // Auto-open when thinking starts
            setIsOpen(true);
        } else {
            // Stop timer
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            // If we were thinking and now stopped, we might want to close it or keep it open?
            // Usually it collapses after thinking is done, or stays as is.
            // The user image shows it collapsed (implied by "Thought for ...").
            // Let's default to collapsed if it's done, unless the user opened it.
            // Actually, let's keep it collapsed by default when done.
            if (elapsed > 0) {
                setIsOpen(false);
            }
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isThinking, elapsed]);

    // If we have content but no elapsed time (e.g. loaded from history),
    // we can't show accurate time. We'll just show "Thought".
    // Unless we save the duration in the message.
    // For now, if elapsed is 0 and not thinking, we hide the time or show a placeholder.

    const toggleOpen = () => setIsOpen(!isOpen);

    return (
        <div className={`thinking-process ${isThinking ? "thinking" : "done"}`}>
            <div className="thinking-header" onClick={toggleOpen}>
                <div className="thinking-icon-wrapper">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="thinking-icon"
                    >
                        <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"></path>
                        <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"></path>
                        <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"></path>
                        <path d="M17.599 6.5a3 3 0 0 0 .399-1.375"></path>
                        <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"></path>
                        <path d="M3.477 10.896a4 4 0 0 1 .585-.396"></path>
                        <path d="M19.938 10.5a4 4 0 0 1 .585.396"></path>
                        <path d="M6 18a4 4 0 0 1-1.967-.516"></path>
                        <path d="M19.967 17.484A4 4 0 0 1 18 18"></path>
                    </svg>
                </div>
                <span className="thinking-label">
                    {isThinking ? "Thinking" : "Thought"}
                    {elapsed > 0 && (
                        <span className="thinking-time">
                            {" "}
                            for {elapsed.toFixed(1)}s
                        </span>
                    )}
                </span>
                <span className={`thinking-chevron ${isOpen ? "open" : ""}`}>
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                    >
                        <path d="M6 9l6 6 6-6" />
                    </svg>
                </span>
            </div>
            {isOpen && (
                <div className="thinking-body">
                    <div className="thinking-content">
                        {content || (isThinking ? "..." : "")}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ThinkingProcess;
