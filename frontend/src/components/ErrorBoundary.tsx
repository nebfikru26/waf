import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCcw, Home, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-background p-6">
          <div className="max-w-md w-full space-y-8 text-center animate-in fade-in zoom-in duration-500">
            <div className="flex justify-center">
              <div className="h-20 w-20 bg-destructive/10 rounded-full flex items-center justify-center relative">
                <ShieldAlert className="h-10 w-10 text-destructive animate-pulse" />
                <div className="absolute inset-0 bg-destructive/20 rounded-full blur-xl opacity-50" />
              </div>
            </div>
            
            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight">System Exception Detected</h1>
              <p className="text-muted-foreground text-sm leading-relaxed">
                A critical runtime error has occurred within the current view context. 
                Our automated telemetry has logged this incident.
              </p>
            </div>

            {import.meta.env.MODE === "development" && this.state.error && (
              <div className="bg-muted/50 border border-border rounded-lg p-4 text-left overflow-auto max-h-40 font-mono text-[10px] text-destructive">
                <p className="font-bold mb-1">{this.state.error.name}: {this.state.error.message}</p>
                <pre className="whitespace-pre-wrap">{this.state.error.stack}</pre>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
              <Button 
                onClick={() => window.location.reload()}
                variant="default"
                className="glow-primary h-11 px-6 font-mono text-xs tracking-wider"
              >
                <RefreshCcw className="h-3.5 w-3.5 mr-2" /> RECOVERY RELOAD
              </Button>
              <Button 
                onClick={() => window.location.href = "/"}
                variant="outline"
                className="h-11 px-6 font-mono text-xs tracking-wider"
              >
                <Home className="h-3.5 w-3.5 mr-2" /> SYSTEM OVERVIEW
              </Button>
            </div>

            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest font-medium pt-8">
              AffiniSecurity Infrastructure Stability Protocol
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
