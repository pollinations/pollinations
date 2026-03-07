import { Component, type ErrorInfo, type ReactNode } from "react";
import { ERROR_BOUNDARY } from "../../copy/content/error";
import { Button } from "./ui/button";

interface ErrorBoundaryProps {
    children: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary Component
 * Catches JavaScript errors anywhere in the child component tree and displays a fallback UI
 *
 * Usage:
 * <ErrorBoundary>
 *   <YourComponent />
 * </ErrorBoundary>
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(_error: Error): ErrorBoundaryState {
        // Update state so the next render will show the fallback UI
        return { hasError: true, error: _error, errorInfo: null };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        // Log error to console in development
        if (import.meta.env.DEV) {
            console.error("Error caught by boundary:", error, errorInfo);
        }

        // Store error details in state
        this.setState({
            error,
            errorInfo,
        });

        // You could also log to an error reporting service here
        // e.g., Sentry.captureException(error);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    render() {
        if (this.state.hasError) {
            // Fallback UI
            return (
                <div className="min-h-screen flex items-center justify-center px-4 bg-cream">
                    <div className="max-w-2xl w-full bg-cream border-r-4 border-b-4 border-dark shadow-dark-lg p-6 md:p-8">
                        <h1 className="font-title text-3xl md:text-4xl font-black text-dark mb-6">
                            {ERROR_BOUNDARY.title}
                        </h1>

                        <div className="space-y-4 mb-6">
                            <p className="font-body text-base text-muted leading-relaxed">
                                {ERROR_BOUNDARY.body}
                            </p>

                            {import.meta.env.DEV && this.state.error && (
                                <div className="bg-white p-4 font-mono text-xs">
                                    <p className="font-black text-dark mb-2">
                                        {ERROR_BOUNDARY.devDetailsLabel}
                                    </p>
                                    <p className="text-muted mb-2">
                                        {this.state.error.toString()}
                                    </p>
                                    {this.state.errorInfo && (
                                        <details className="mt-2">
                                            <summary className="cursor-pointer text-dark hover:text-dark">
                                                {
                                                    ERROR_BOUNDARY.devComponentStack
                                                }
                                            </summary>
                                            <pre className="mt-2 text-subtle whitespace-pre-wrap text-[10px]">
                                                {
                                                    this.state.errorInfo
                                                        .componentStack
                                                }
                                            </pre>
                                        </details>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <Button
                                variant="primary"
                                onClick={this.handleReset}
                            >
                                {ERROR_BOUNDARY.tryAgainButton}
                            </Button>
                            <Button variant="secondary" as="a" href="/">
                                {ERROR_BOUNDARY.goHomeButton}
                            </Button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
