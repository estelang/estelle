import type { Expr, Program } from "../ast/index.ts";
import type { CompileDiagnostic } from "../diagnostics.ts";

export interface ParseOk {
	readonly ok: true;
	readonly program: Program;
}
export interface ParseFail {
	readonly ok: false;
	readonly diagnostics: readonly CompileDiagnostic[];
}
export type ParseResult = ParseOk | ParseFail;
export interface ParseExprOk {
	readonly ok: true;
	readonly expr: Expr;
}
export type ParseExprResult = ParseExprOk | ParseFail;
