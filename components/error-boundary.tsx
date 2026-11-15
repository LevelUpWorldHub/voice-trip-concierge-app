"use client";

import { Component, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode };
type State = { error: string | null };

export class TripErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error: error.message || "The screen hit an unexpected error." };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-4 p-6">
        <Alert variant="destructive">
          <AlertTitle>The concierge caught an error and stayed up</AlertTitle>
          <AlertDescription>{this.state.error}</AlertDescription>
        </Alert>
        <Button onClick={() => this.setState({ error: null })}>Try the screen again</Button>
      </div>
    );
  }
}
