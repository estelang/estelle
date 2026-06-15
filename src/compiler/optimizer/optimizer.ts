import type {
	Program,
	FncDecl,
	Stmt,
	Expr,
	AssignTarget,
} from "../ast/index.ts";
import {
	getLiteralValue,
	isLiteral,
	isTruthy,
	wikiTruthyLiteral,
} from "./literals.ts";

export function optimize(program: Program): Program {
	return {
		...program,
		fncs: program.fncs.map(optimizeFnc),
	};
}

function optimizeFnc(fnc: FncDecl): FncDecl {
	const assignCount = new Map<string, number>();
	const constants = new Map<string, Expr>();
	const ineligible = new Set<string>();

	function markIneligible(n: string) {
		ineligible.add(n);
	}
	for (const p of fnc.params) markIneligible(p.name);

	function scanExpr(e: Expr) {
		if (!e) return;
		switch (e.kind) {
			case "Binary":
				scanExpr(e.left);
				scanExpr(e.right);
				break;
			case "Unary":
				scanExpr(e.right);
				break;
			case "List":
				e.items.forEach(scanExpr);
				break;
			case "Map":
				e.entries.forEach((kv) => scanExpr(kv.value));
				break;
			case "Index":
				scanExpr(e.object);
				scanExpr(e.index);
				break;
			case "Member":
				scanExpr(e.object);
				break;
			case "Call":
				scanExpr(e.callee);
				e.args.forEach(scanExpr);
				break;
			case "MethodCall":
				scanExpr(e.object);
				if (e.form.kind === "args") e.form.args.forEach(scanExpr);
				else scanExpr(e.form.table);
				break;
			case "Lambda":
				e.params.forEach(markIneligible);
				scanExpr(e.body);
				break;
			case "Coerce":
				scanExpr(e.expr);
				break;
		}
	}

	function scanBlock(stmts: readonly Stmt[]) {
		for (const s of stmts) scanStmt(s);
	}

	function scanStmt(s: Stmt) {
		switch (s.kind) {
			case "Assign":
				if (s.target.kind === "Var") {
					const name = s.target.name;
					assignCount.set(name, (assignCount.get(name) || 0) + 1);
					if (isLiteral(s.value)) constants.set(name, s.value);
				}
				scanExpr(s.value);
				if (s.target.kind === "Index") {
					scanExpr(s.target.object);
					scanExpr(s.target.index);
				}
				if (s.target.kind === "Member") scanExpr(s.target.object);
				break;
			case "CompoundAssign":
				if (s.target.kind === "Var") {
					const name = s.target.name;
					assignCount.set(name, (assignCount.get(name) || 0) + 1);
					constants.delete(name);
				}
				scanExpr(s.value);
				if (s.target.kind === "Index") {
					scanExpr(s.target.object);
					scanExpr(s.target.index);
				}
				if (s.target.kind === "Member") scanExpr(s.target.object);
				break;
			case "Output":
				scanExpr(s.value);
				break;
			case "Return":
				if (s.value) scanExpr(s.value);
				break;
			case "ExprStmt":
				scanExpr(s.expr);
				break;
			case "If":
				s.branches.forEach((b) => {
					scanExpr(b.condition);
					scanBlock(b.body);
				});
				if (s.elseBody) scanBlock(s.elseBody);
				break;
			case "ForIn":
				if (s.indexName) markIneligible(s.indexName);
				markIneligible(s.itemName);
				scanExpr(s.iterable);
				scanBlock(s.body);
				break;
			case "ForRange":
				markIneligible(s.varName);
				scanExpr(s.start);
				scanExpr(s.end);
				scanBlock(s.body);
				break;
			case "While":
				scanExpr(s.condition);
				scanBlock(s.body);
				break;
			case "Repeat":
				scanExpr(s.count);
				scanBlock(s.body);
				break;
			case "Try":
				if (s.catchVar) markIneligible(s.catchVar);
				scanBlock(s.tryBody);
				if (s.catchBody) scanBlock(s.catchBody);
				break;
			case "Lua":
				const words = s.source.match(/[a-zA-Z_]\w*/g) || [];
				words.forEach(markIneligible);
				break;
			case "NestFnc":
				s.fnc.params.forEach((p) => markIneligible(p.name));
				scanBlock(s.fnc.body);
				break;
		}
	}

	scanBlock(fnc.body);

	const env = new Map<string, Expr>();
	for (const [name, count] of assignCount.entries()) {
		if (count === 1 && !ineligible.has(name) && constants.has(name)) {
			env.set(name, constants.get(name)!);
		}
	}

	return { ...fnc, body: optimizeBlock(fnc.body, env) };
}

function optimizeBlock(stmts: readonly Stmt[], env: Map<string, Expr>): Stmt[] {
	const result: Stmt[] = [];
	for (const stmt of stmts) {
		const opt = optimizeStmt(stmt, env);
		if (!opt) continue;
		if (Array.isArray(opt)) {
			result.push(...opt);
			const last = opt[opt.length - 1];
			if (
				last &&
				(last.kind === "Return" ||
					last.kind === "Break" ||
					last.kind === "Continue")
			) {
				break;
			}
		} else {
			result.push(opt);
			if (
				opt.kind === "Return" ||
				opt.kind === "Break" ||
				opt.kind === "Continue"
			) {
				break;
			}
		}
	}
	return result;
}

function optimizeStmt(
	stmt: Stmt,
	env: Map<string, Expr>,
): Stmt | Stmt[] | null {
	switch (stmt.kind) {
		case "ExprStmt":
			return { ...stmt, expr: optimizeExpr(stmt.expr, env) };
		case "Assign":
			if (stmt.target.kind === "Var" && env.has(stmt.target.name)) {
				return null;
			}
			return {
				...stmt,
				target: optimizeAssignTarget(stmt.target, env),
				value: optimizeExpr(stmt.value, env),
			};
		case "CompoundAssign":
			return {
				...stmt,
				target: optimizeAssignTarget(stmt.target, env),
				value: optimizeExpr(stmt.value, env),
			};
		case "Output":
			return { ...stmt, value: optimizeExpr(stmt.value, env) };
		case "Return":
			return {
				...stmt,
				value: stmt.value ? optimizeExpr(stmt.value, env) : null,
			};
		case "If": {
			const newBranches = [];
			for (const branch of stmt.branches) {
				const cond = optimizeExpr(branch.condition, env);
				if (isLiteral(cond)) {
					if (isTruthy(cond)) {
						if (newBranches.length === 0)
							return optimizeBlock(branch.body, env);
						return {
							...stmt,
							branches: newBranches,
							elseBody: optimizeBlock(branch.body, env),
						};
					} else {
						continue;
					}
				}
				newBranches.push({
					condition: cond,
					body: optimizeBlock(branch.body, env),
				});
			}
			const newElse = stmt.elseBody
				? optimizeBlock(stmt.elseBody, env)
				: null;
			if (newBranches.length === 0) return newElse ? newElse : null;
			return { ...stmt, branches: newBranches, elseBody: newElse };
		}
		case "ForIn":
			return {
				...stmt,
				iterable: optimizeExpr(stmt.iterable, env),
				body: optimizeBlock(stmt.body, env),
			};
		case "ForRange":
			return {
				...stmt,
				start: optimizeExpr(stmt.start, env),
				end: optimizeExpr(stmt.end, env),
				body: optimizeBlock(stmt.body, env),
			};
		case "While": {
			const cond = optimizeExpr(stmt.condition, env);
			if (isLiteral(cond) && !isTruthy(cond)) return null;
			const optimizedBody = optimizeBlock(stmt.body, env);
			if (optimizedBody.length === 0 && isLiteral(cond)) return null;
			return { ...stmt, condition: cond, body: optimizedBody };
		}
		case "Repeat": {
			const countExpr = optimizeExpr(stmt.count, env);
			const optimizedBody = optimizeBlock(stmt.body, env);

			if (optimizedBody.length === 0) return null;

			if (countExpr.kind === "Number") {
				const n = countExpr.value;
				if (Number.isInteger(n) && n > 0 && n <= 5) {
					const unrolled: Stmt[] = [];
					for (let i = 0; i < n; i++) {
						unrolled.push(...optimizedBody);
					}
					return unrolled;
				}
				if (n <= 0) return null;
			}

			return { ...stmt, count: countExpr, body: optimizedBody };
		}
		case "Try":
			return {
				...stmt,
				tryBody: optimizeBlock(stmt.tryBody, env),
				catchBody: stmt.catchBody
					? optimizeBlock(stmt.catchBody, env)
					: null,
			};
		case "NestFnc":
			return { ...stmt, fnc: optimizeFnc(stmt.fnc) };
		default:
			return stmt;
	}
}

function optimizeAssignTarget(
	t: AssignTarget,
	env: Map<string, Expr>,
): AssignTarget {
	if (t.kind === "Index")
		return {
			...t,
			object: optimizeExpr(t.object, env),
			index: optimizeExpr(t.index, env),
		};
	if (t.kind === "Member")
		return { ...t, object: optimizeExpr(t.object, env) };
	return t;
}

function optimizeExpr(e: Expr, env: Map<string, Expr>): Expr {
	switch (e.kind) {
		case "Ident":
			if (env.has(e.name)) return env.get(e.name)!;
			return e;
		case "Unary": {
			const right = optimizeExpr(e.right, env);
			if (isLiteral(right)) {
				const val = getLiteralValue(right);
				if (e.op === "-" && typeof val === "number")
					return { kind: "Number", value: -val };
				if (e.op === "not")
					return { kind: "Bool", value: !isTruthy(right) };
			}
			return { ...e, right };
		}
		case "Binary": {
			const left = optimizeExpr(e.left, env);
			const right = optimizeExpr(e.right, env);
			if (isLiteral(left) && isLiteral(right)) {
				const l = getLiteralValue(left);
				const r = getLiteralValue(right);
				if (
					e.op === "+" &&
					typeof l === "number" &&
					typeof r === "number"
				)
					return { kind: "Number", value: l + r };
				if (
					e.op === "-" &&
					typeof l === "number" &&
					typeof r === "number"
				)
					return { kind: "Number", value: l - r };
				if (
					e.op === "*" &&
					typeof l === "number" &&
					typeof r === "number"
				)
					return { kind: "Number", value: l * r };
				if (
					e.op === "/" &&
					typeof l === "number" &&
					typeof r === "number"
				)
					return { kind: "Number", value: l / r };
				if (
					e.op === "%" &&
					typeof l === "number" &&
					typeof r === "number"
				)
					return { kind: "Number", value: l % r };
				if (
					e.op === ".." &&
					(typeof l === "string" || typeof l === "number") &&
					(typeof r === "string" || typeof r === "number")
				)
					return { kind: "String", value: String(l) + String(r) };
				if (e.op === "==") return { kind: "Bool", value: l === r };
				if (e.op === "!=") return { kind: "Bool", value: l !== r };
				if (
					e.op === "<" &&
					typeof l === "number" &&
					typeof r === "number"
				)
					return { kind: "Bool", value: l < r };
				if (
					e.op === ">" &&
					typeof l === "number" &&
					typeof r === "number"
				)
					return { kind: "Bool", value: l > r };
				if (
					e.op === "<=" &&
					typeof l === "number" &&
					typeof r === "number"
				)
					return { kind: "Bool", value: l <= r };
				if (
					e.op === ">=" &&
					typeof l === "number" &&
					typeof r === "number"
				)
					return { kind: "Bool", value: l >= r };
			}

			if (
				e.op === "+" &&
				isLiteral(right) &&
				getLiteralValue(right) === 0
			)
				return left;
			if (e.op === "+" && isLiteral(left) && getLiteralValue(left) === 0)
				return right;
			if (
				e.op === "-" &&
				isLiteral(right) &&
				getLiteralValue(right) === 0
			)
				return left;
			if (
				e.op === "*" &&
				isLiteral(right) &&
				getLiteralValue(right) === 1
			)
				return left;
			if (e.op === "*" && isLiteral(left) && getLiteralValue(left) === 1)
				return right;
			if (
				e.op === "*" &&
				isLiteral(right) &&
				getLiteralValue(right) === 0
			)
				return { kind: "Number", value: 0 };
			if (e.op === "*" && isLiteral(left) && getLiteralValue(left) === 0)
				return { kind: "Number", value: 0 };
			if (
				e.op === "/" &&
				isLiteral(right) &&
				getLiteralValue(right) === 1
			)
				return left;

			if (e.op === "/" && isLiteral(right)) {
				const val = getLiteralValue(right);
				if (typeof val === "number" && val !== 0 && val !== 1) {
					return {
						kind: "Binary",
						op: "*",
						left,
						right: { kind: "Number", value: 1 / val },
					};
				}
			}

			if (
				e.op === ".." &&
				isLiteral(right) &&
				getLiteralValue(right) === ""
			)
				return left;
			if (
				e.op === ".." &&
				isLiteral(left) &&
				getLiteralValue(left) === ""
			)
				return right;

			if (e.op === "or" && isLiteral(left))
				return isTruthy(left) ? left : right;
			if (e.op === "and" && isLiteral(left))
				return !isTruthy(left) ? left : right;
			return { ...e, left, right };
		}
		case "List":
			return { ...e, items: e.items.map((i) => optimizeExpr(i, env)) };
		case "Map":
			return {
				...e,
				entries: e.entries.map((kv) => ({
					...kv,
					value: optimizeExpr(kv.value, env),
				})),
			};
		case "Index":
			return {
				...e,
				object: optimizeExpr(e.object, env),
				index: optimizeExpr(e.index, env),
			};
		case "Member":
			return { ...e, object: optimizeExpr(e.object, env) };
		case "Call": {
			const optimizedCallee = optimizeExpr(e.callee, env);
			const optimizedArgs = e.args.map((a) => optimizeExpr(a, env));

			if (optimizedCallee.kind === "Ident") {
				const name = optimizedCallee.name;
				if (optimizedArgs.every(isLiteral)) {
					const vals = optimizedArgs.map(getLiteralValue);
					if (name === "abs" && typeof vals[0] === "number")
						return { kind: "Number", value: Math.abs(vals[0]) };
					if (name === "floor" && typeof vals[0] === "number")
						return { kind: "Number", value: Math.floor(vals[0]) };
					if (name === "ceil" && typeof vals[0] === "number")
						return { kind: "Number", value: Math.ceil(vals[0]) };
					if (name === "round" && typeof vals[0] === "number")
						return { kind: "Number", value: Math.round(vals[0]) };
					if (name === "tonum") {
						const num = Number(vals[0]);
						if (!isNaN(num)) return { kind: "Number", value: num };
					}
					if (name === "tostr" && vals[0] !== null)
						return { kind: "String", value: String(vals[0]) };
					if (name === "len" && typeof vals[0] === "string")
						return { kind: "Number", value: vals[0].length };
					if (name === "lower" && typeof vals[0] === "string")
						return { kind: "String", value: vals[0].toLowerCase() };
					if (name === "upper" && typeof vals[0] === "string")
						return { kind: "String", value: vals[0].toUpperCase() };
					if (name === "trim" && typeof vals[0] === "string")
						return { kind: "String", value: vals[0].trim() };
				}
				if (
					name === "len" &&
					optimizedArgs.length === 1 &&
					optimizedArgs[0]!.kind === "List"
				) {
					return {
						kind: "Number",
						value: optimizedArgs[0]!.items.length,
					};
				}
				if (
					name === "default" &&
					optimizedArgs.length === 2 &&
					isLiteral(optimizedArgs[0]!) &&
					isLiteral(optimizedArgs[1]!)
				) {
					const v = getLiteralValue(optimizedArgs[0]!);
					if (v === null || v === "")
						return optimizedArgs[1]!;
					return optimizedArgs[0]!;
				}
			}

			return { ...e, callee: optimizedCallee, args: optimizedArgs };
		}
		case "MethodCall":
			return {
				...e,
				object: optimizeExpr(e.object, env),
				form:
					e.form.kind === "args"
						? {
								kind: "args",
								args: e.form.args.map((a) =>
									optimizeExpr(a, env),
								),
							}
						: {
								kind: "table",
								table: optimizeExpr(e.form.table, env),
							},
			};
		case "Lambda":
			return { ...e, body: optimizeExpr(e.body, env) };
		case "Coerce": {
			const inner = optimizeExpr(e.expr, env);
			if (e.type === "bool") {
				const t = wikiTruthyLiteral(inner);
				if (t !== null) return { kind: "Bool", value: t };
			}
			if (e.type === "num" && isLiteral(inner)) {
				const v = getLiteralValue(inner);
				if (typeof v === "number") return { kind: "Number", value: v };
				if (typeof v === "string") {
					const n = Number(v);
					if (!Number.isNaN(n)) return { kind: "Number", value: n };
				}
			}
			return { ...e, expr: inner };
		}
		default:
			return e;
	}
}
