import { Component, type ErrorInfo, type ReactNode } from "react";
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
                <div className="min-h-screen flex items-center justify-center px-4 bg-surface-base">
                    <div className="max-w-2xl w-full bg-surface-base border-r-4 border-b-4 border-border-brand shadow-shadow-brand-lg p-6 md:p-8">
                        <h1 className="font-title text-3xl md:text-4xl font-black text-text-body-main mb-6">
                            Something went wrong
                        </h1>

                        <div className="space-y-4 mb-6">
                            <p className="font-body text-base text-text-body-secondary leading-relaxed">
                                We encountered an unexpected error. This has
                                been logged and we'll look into it.
                            </p>

                            {import.meta.env.DEV && this.state.error && (
                                <div className="bg-input-background p-4 font-mono text-xs">
                                    <p className="font-black text-text-brand mb-2">
                                        Error Details (dev mode):
                                    </p>
                                    <p className="text-text-body-secondary mb-2">
                                        {this.state.error.toString()}
                                    </p>
                                    {this.state.errorInfo && (
                                        <details className="mt-2">
                                            <summary className="cursor-pointer text-text-body-main hover:text-text-body-main">
                                                Component Stack
                                            </summary>
                                            <pre className="mt-2 text-text-caption whitespace-pre-wrap text-[10px]">
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
                                Try Again
                            </Button>
                            <Button variant="secondary" as="a" href="/">
                                Go Home
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
