import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button, ErrorState, Panel } from "../ui";

/**
 * The last line of defence: a render error in one view must not blank the
 * whole app during champion select.
 */
export class ErrorBoundary extends Component<
    { children: ReactNode; fallbackTitle?: string },
    { error: Error | null }
> {
    override state: { error: Error | null } = { error: null };

    static getDerivedStateFromError(error: Error): { error: Error } {
        return { error };
    }

    override componentDidCatch(error: Error, info: ErrorInfo): void {
        console.error("Erreur de rendu", error, info.componentStack);
    }

    override render(): ReactNode {
        const { error } = this.state;
        if (!error) return this.props.children;
        return (
            <Panel title={this.props.fallbackTitle ?? "Erreur"}>
                <ErrorState
                    title="Cette vue n'a pas pu s'afficher"
                    description={error.message}
                    action={
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => this.setState({ error: null })}
                        >
                            Réessayer
                        </Button>
                    }
                />
            </Panel>
        );
    }
}
