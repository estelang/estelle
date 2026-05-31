import type { Expr } from "../ast/index.ts";

export function isLiteral(e: Expr): boolean {
	return (
		e.kind === "String" ||
		e.kind === "Number" ||
		e.kind === "Bool" ||
		e.kind === "Nil"
	);
}

export function getLiteralValue(e: Expr): string | number | boolean | null {
	return e.kind === "String" || e.kind === "Number" || e.kind === "Bool"
		? e.value
		: null;
}

export function isTruthy(e: Expr): boolean {
	return e.kind === "Nil" ? false : e.kind === "Bool" ? e.value : true;
}
