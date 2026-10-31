import { Component, type ErrorInfo, type ReactNode } from "react";
import i18n from "@/lib/i18n";
import { Button } from "./ui/button";

type ErrorBoundaryProps = {
	children: ReactNode;
};

type ErrorBoundaryState = {
	error: Error | null;
};

/**
 * Last line of defence for a render crash: instead of a blank webview, show
 * what happened and a way back. Wraps each window's root.
 */
export class ErrorBoundary extends Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	state: ErrorBoundaryState = { error: null };

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error("[ui] render crash", error, info.componentStack);
	}

	reload = () => {
		window.location.reload();
	};

	render() {
		if (!this.state.error) return this.props.children;

		return (
			<main className="flex h-full w-full flex-col items-center justify-center gap-y-4 p-8 text-center">
				<h1 className="font-medium text-foreground text-lg">
					{i18n.t("errors:crash_title")}
				</h1>
				<p className="max-w-sm text-muted text-sm">
					{i18n.t("errors:crash_description")}
				</p>
				<code className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-md bg-background-top px-2 py-1 text-muted text-xs">
					{this.state.error.message}
				</code>
				<Button
					variant="secondary"
					className="h-7 rounded-full py-0 active:scale-[0.96]"
					onClick={this.reload}
				>
					{i18n.t("errors:reload")}
				</Button>
			</main>
		);
	}
}
