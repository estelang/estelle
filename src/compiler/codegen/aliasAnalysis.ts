import type { Expr, Stmt } from "../ast/index.ts";
import { HOT_GLOBAL_ALIAS_ORDER, HOT_GLOBAL_BY_BUILTIN } from "./runtime.ts";

function countBuiltinCalls(stmts: readonly Stmt[]): Map<string, number> {
	const counts = new Map<string, number>();
	const bump = (name: string) =>
		counts.set(name, (counts.get(name) ?? 0) + 1);

	const visitExpr = (expr: Expr): void => {
		switch (expr.kind) {
			case "Unary":
				visitExpr(expr.right);
				return;
			case "Binary":
				visitExpr(expr.left);
				visitExpr(expr.right);
				return;
			case "List":
				expr.items.forEach(visitExpr);
				return;
			case "Map":
				expr.entries.forEach((entry) => visitExpr(entry.value));
				return;
			case "Index":
				visitExpr(expr.object);
				visitExpr(expr.index);
				return;
			case "Member":
				visitExpr(expr.object);
				return;
			case "Call":
				if (expr.callee.kind === "Ident") bump(expr.callee.name);
				else visitExpr(expr.callee);
				expr.args.forEach(visitExpr);
				return;
			case "MethodCall":
				visitExpr(expr.object);
				if (expr.form.kind === "args")
					expr.form.args.forEach(visitExpr);
				else visitExpr(expr.form.table);
				return;
			case "Lambda":
				visitExpr(expr.body);
				return;
		}
	};

	const visitStmt = (stmt: Stmt): void => {
		switch (stmt.kind) {
			case "Assign":
				if (stmt.target.kind === "Index") {
					visitExpr(stmt.target.object);
					visitExpr(stmt.target.index);
				} else if (stmt.target.kind === "Member") {
					visitExpr(stmt.target.object);
				}
				visitExpr(stmt.value);
				return;
			case "Output":
				visitExpr(stmt.value);
				return;
			case "Return":
				if (stmt.value) visitExpr(stmt.value);
				return;
			case "ExprStmt":
				visitExpr(stmt.expr);
				return;
			case "If":
				stmt.branches.forEach((branch) => {
					visitExpr(branch.condition);
					branch.body.forEach(visitStmt);
				});
				stmt.elseBody?.forEach(visitStmt);
				return;
			case "ForIn":
				visitExpr(stmt.iterable);
				stmt.body.forEach(visitStmt);
				return;
			case "While":
				visitExpr(stmt.condition);
				stmt.body.forEach(visitStmt);
				return;
			case "Repeat":
				visitExpr(stmt.count);
				stmt.body.forEach(visitStmt);
				return;
			case "Try":
				stmt.tryBody.forEach(visitStmt);
				stmt.catchBody?.forEach(visitStmt);
				return;
			case "NestFnc":
				stmt.fnc.body.forEach(visitStmt);
				return;
		}
	};

	stmts.forEach(visitStmt);
	return counts;
}

export function buildGlobalAliases(
	stmts: readonly Stmt[],
): Map<string, string> {
	const builtinCounts = countBuiltinCalls(stmts);
	const pathCounts = new Map<string, number>();
	for (const [name, count] of builtinCounts.entries()) {
		const path = HOT_GLOBAL_BY_BUILTIN[name];
		if (!path) continue;
		pathCounts.set(path, (pathCounts.get(path) ?? 0) + count);
	}
	const aliases = new Map<string, string>();
	for (const path of HOT_GLOBAL_ALIAS_ORDER) {
		if ((pathCounts.get(path) ?? 0) < 2) continue;
		aliases.set(path, `__estelle_${path.replace(/\./g, "_")}`);
	}
	return aliases;
}
