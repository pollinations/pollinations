import { Alert } from "@pollinations/ui";
import { Component, type ReactNode } from "react";

type Props = { resetKey: string; children: ReactNode };
type State = { error: string | null };

// One insight tab crashing (e.g. toUsd throwing on an unknown currency) must
// not white-screen the whole tree — this keeps the header/navs alive so the
// user can switch away, and retries automatically when the reset key changes.
export class ErrorBoundary extends Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(caught: unknown): State {
        return {
            error: caught instanceof Error ? caught.message : String(caught),
        };
    }

    componentDidUpdate(prevProps: Props) {
        if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
            this.setState({ error: null });
        }
    }

    render() {
        if (this.state.error) {
            return (
                <Alert intent="warning" title="Tab failed to render">
                    {this.state.error}
                </Alert>
            );
        }
        return this.props.children;
    }
}
