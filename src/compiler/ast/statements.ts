import type { Expr } from "./expressions.ts";
import type { FncDecl } from "./program.ts";

export type Stmt =
	| NestFncStmt
	| OutputStmt
	| OutputBlockStmt
	| AssignStmt
	| CompoundAssignStmt
	| ReturnStmt
	| ExprStmt
	| IfStmt
	| ForInStmt
	| ForRangeStmt
	| WhileStmt
	| RepeatStmt
	| BreakStmt
	| ContinueStmt
	| TryStmt
	| LuaStmt;

export interface AssignStmt {
	readonly kind: "Assign";
	readonly target: AssignTarget;
	readonly value: Expr;
}

export interface CompoundAssignStmt {
	readonly kind: "CompoundAssign";
	readonly target: AssignTarget;
	readonly value: Expr;
}

export type AssignTarget =
	| { readonly kind: "Var"; readonly name: string }
	| {
			readonly kind: "Member";
			readonly object: Expr;
			readonly property: string;
	  }
	| { readonly kind: "Index"; readonly object: Expr; readonly index: Expr };

export interface NestFncStmt {
	readonly kind: "NestFnc";
	readonly fnc: FncDecl;
}

export interface OutputStmt {
	readonly kind: "Output";
	readonly value: Expr;
}

export interface OutputBlockStmt {
	readonly kind: "OutputBlock";
	readonly value: string;
}

export interface ReturnStmt {
	readonly kind: "Return";
	readonly value: Expr | null;
}

export interface ExprStmt {
	readonly kind: "ExprStmt";
	readonly expr: Expr;
}

export interface IfBranch {
	readonly condition: Expr;
	readonly body: readonly Stmt[];
}

export interface IfStmt {
	readonly kind: "If";
	readonly branches: readonly IfBranch[];
	readonly elseBody: readonly Stmt[] | null;
}

export interface ForInStmt {
	readonly kind: "ForIn";
	readonly indexName: string | null;
	readonly itemName: string;
	readonly iterable: Expr;
	readonly body: readonly Stmt[];
}

export interface ForRangeStmt {
	readonly kind: "ForRange";
	readonly varName: string;
	readonly start: Expr;
	readonly end: Expr;
	readonly body: readonly Stmt[];
}

export interface WhileStmt {
	readonly kind: "While";
	readonly condition: Expr;
	readonly body: readonly Stmt[];
}

export interface RepeatStmt {
	readonly kind: "Repeat";
	readonly count: Expr;
	readonly body: readonly Stmt[];
}

export interface BreakStmt {
	readonly kind: "Break";
}

export interface ContinueStmt {
	readonly kind: "Continue";
}

export interface TryStmt {
	readonly kind: "Try";
	readonly tryBody: readonly Stmt[];
	readonly catchVar: string | null;
	readonly catchBody: readonly Stmt[] | null;
}

export interface LuaStmt {
	readonly kind: "Lua";
	readonly source: string;
}
