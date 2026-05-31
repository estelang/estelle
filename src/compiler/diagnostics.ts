export type Severity = "error" | "warning";

export interface SourceSpan {
	start: number;
	end: number;
}

export interface CompileDiagnostic {
	readonly severity: Severity;
	readonly message: string;
	readonly span?: SourceSpan;
}

export interface CompileResult {
	readonly lua: string | null;
	readonly diagnostics: readonly CompileDiagnostic[];
}

export function hasErrors(diagnostics: readonly CompileDiagnostic[]): boolean {
	return diagnostics.some((d) => d.severity === "error");
}
