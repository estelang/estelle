export type {
	Severity,
	SourceSpan,
	CompileDiagnostic,
	CompileResult,
} from "./diagnostics.ts";
export { hasErrors } from "./diagnostics.ts";
export { TK, type Token } from "./lexer/index.ts";
export type {
	EstelleType,
	Program,
	FncDecl,
	ImportDecl,
	Param,
	Stmt,
	AssignStmt,
	AssignTarget,
	OutputStmt,
	OutputBlockStmt,
	ReturnStmt,
	ExprStmt,
	IfStmt,
	IfBranch,
	ForInStmt,
	WhileStmt,
	RepeatStmt,
	BreakStmt,
	ContinueStmt,
	TryStmt,
	LuaStmt,
	Expr,
} from "./ast/index.ts";
export type { ParseResult } from "./parser/index.ts";
export { transpile, type TranspileOptions } from "./transpile.ts";
