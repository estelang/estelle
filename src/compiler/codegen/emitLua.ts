import type {
	Program,
	FncDecl,
	Stmt,
	Expr,
	EstelleType,
} from "../ast/index.ts";
import { buildGlobalAliases } from "./aliasAnalysis.ts";
import {
	emitExpr,
	emitInterpolatedString,
	inferExprKind,
} from "./expressionEmitter.ts";
import {
	emitGlobalAliasLines,
	emitRuntimeHelper,
	RUNTIME_HELPER_ORDER,
} from "./runtime.ts";
import {
	IND_STEP,
	INVOKE_OUTPUT_RETURN_EXPR,
	mapTypeToKind,
	type EmitCtx,
	type RuntimeHelper,
	type ValueKind,
} from "./types.ts";

function flushPending(ctx: EmitCtx, lines: string[]): string[] {
	if (ctx.pendingLines.length === 0) return lines;
	const pending = ctx.pendingLines;
	ctx.pendingLines = [];
	return [...pending, ...lines];
}

function applyCoerce(expr: string, type: EstelleType | null): string {
	if (type === "num") return `tonumber(${expr})`;
	return expr;
}

function emitTarget(
	target: Extract<Stmt, { kind: "Assign" }>["target"],
	ctx: EmitCtx,
): string {
	switch (target.kind) {
		case "Var":
			return target.name;
		case "Member":
			return `${emitExpr(target.object, ctx)}.${target.property}`;
		case "Index":
			return `${emitExpr(target.object, ctx)}[${emitExpr(target.index, ctx)}]`;
	}
}

function emitAssignStmt(
	s: Extract<Stmt, { kind: "Assign" }>,
	ctx: EmitCtx,
): string[] {
	const expr = emitExpr(s.value, ctx);
	const target = emitTarget(s.target, ctx);
	const localPrefix =
		s.target.kind === "Var" && !ctx.locals.has(s.target.name);
	if (s.target.kind === "Var") {
		ctx.locals.add(s.target.name);
		ctx.varKinds.set(
			s.target.name,
			s.coerce ? mapTypeToKind(s.coerce) : inferExprKind(s.value, ctx),
		);
	}
	if (s.coerce === "bool") {
		ctx.coerceTempId += 1;
		const temp = `__estelle_coerce_${ctx.coerceTempId}`;
		if (s.target.kind === "Var") ctx.varKinds.set(s.target.name, "bool");
		return [
			`${ctx.indent}local ${temp} = ${expr}`,
			`${ctx.indent}${localPrefix ? "local " : ""}${target} = (${temp} == "true" or ${temp} == "1")`,
		];
	}
	return [
		`${ctx.indent}${localPrefix ? "local " : ""}${target} = ${applyCoerce(expr, s.coerce)}`,
	];
}

function emitOutputBlock(raw: string, ctx: EmitCtx): string[] {
	let lines = raw.replace(/\r\n?/g, "\n").split("\n");
	while (lines.length && lines[0]!.trim() === "") lines.shift();
	while (lines.length && lines[lines.length - 1]!.trim() === "") lines.pop();
	if (lines.length === 0) return [];
	const baseIndent =
		lines.find((l) => l.trim().length > 0)?.match(/^[\t ]*/)?.[0] ?? "";
	if (baseIndent) {
		lines = lines.map((l) =>
			l.startsWith(baseIndent) ? l.slice(baseIndent.length) : l,
		);
	}
	const result: string[] = [];
	for (const line of lines) {
		const trimmed = line.replace(/\s+$/, "");
		const emitted = `${ctx.indent}_out[#_out + 1] = ${emitInterpolatedString(trimmed, ctx)}`;
		result.push(...flushPending(ctx, [emitted]));
	}
	return result;
}
function emitStmt(s: Stmt, ctx: EmitCtx): string[] {
	switch (s.kind) {
		case "Assign":
			return flushPending(ctx, emitAssignStmt(s, ctx));
		case "Output":
			return flushPending(ctx, [
				`${ctx.indent}_out[#_out + 1] = ${emitExpr(s.value, ctx)}`,
			]);
		case "OutputBlock":
			return emitOutputBlock(s.value, ctx);
		case "Return":
			if (s.value)
				return flushPending(ctx, [
					`${ctx.indent}return ${emitExpr(s.value, ctx)}`,
				]);
			return flushPending(ctx, [
				`${ctx.indent}return${ctx.invokeScoped ? (ctx.usesOutput ? ` ${INVOKE_OUTPUT_RETURN_EXPR}` : ' ""') : ""}`,
			]);
		case "ExprStmt":
			if (
				s.expr.kind === "Call" &&
				s.expr.callee.kind === "Ident" &&
				s.expr.callee.name === "push" &&
				s.expr.args.length === 2 &&
				s.expr.args[0]?.kind === "Ident"
			) {
				const list = emitExpr(s.expr.args[0], ctx);
				const value = emitExpr(s.expr.args[1], ctx);
				return flushPending(ctx, [
					`${ctx.indent}${list}[#${list} + 1] = ${value}`,
				]);
			}
			if (s.expr.kind !== "Call" && s.expr.kind !== "MethodCall")
				return flushPending(ctx, [
					`${ctx.indent}do local _ = ${emitExpr(s.expr, ctx)} end`,
				]);
			return flushPending(ctx, [`${ctx.indent}${emitExpr(s.expr, ctx)}`]);
		case "If": {
			const out: string[] = [];
			const first = s.branches[0]!;
			const firstCond = emitExpr(first.condition, ctx);
			out.push(
				...flushPending(ctx, [`${ctx.indent}if ${firstCond} then`]),
			);
			for (const inner of first.body) out.push(...emitStmt(inner, ctx));
			s.branches.forEach((b, i) => {
				if (i === 0) return;
				const cond = emitExpr(b.condition, ctx);
				out.push(
					...flushPending(ctx, [`${ctx.indent}elseif ${cond} then`]),
				);
				for (const inner of b.body) out.push(...emitStmt(inner, ctx));
			});
			if (s.elseBody) {
				out.push(`${ctx.indent}else`);
				for (const inner of s.elseBody)
					out.push(...emitStmt(inner, ctx));
			}
			out.push(`${ctx.indent}end`);
			return out;
		}
		case "ForIn":
			return emitLoopWithContinue(() => {
				const iter = emitExpr(s.iterable, ctx);
				const pending = flushPending(ctx, []);
				ctx.coerceTempId++;

				let listRef: string;
				if (s.iterable.kind === "Ident") {
					listRef = iter;
				} else {
					const listId = "__list" + ctx.coerceTempId;
					pending.push(`${ctx.indent}local ${listId} = ${iter}`);
					listRef = listId;
				}

				const idx = s.indexName || "__i" + ctx.coerceTempId;
				if (s.indexName) ctx.locals.add(s.indexName);
				ctx.locals.add(s.itemName);
				ctx.varKinds.set(s.itemName, "unknown");
				const iterableKind = inferExprKind(s.iterable, ctx);
				if (s.indexName && iterableKind === "map")
					return {
						pending,
						head: `${ctx.indent}for ${s.indexName}, ${s.itemName} in pairs(${listRef}) do`,
						body: s.body,
						tail: `${ctx.indent}end`,
					};
				return {
					pending,
					head: `${ctx.indent}for ${idx} = 1, #${listRef} do\n${ctx.indent}${IND_STEP}local ${s.itemName} = ${listRef}[${idx}]`,
					body: s.body,
					tail: `${ctx.indent}end`,
				};
			}, ctx);
		case "While":
			return emitLoopWithContinue(() => {
				const cond = emitExpr(s.condition, ctx);
				return {
					pending: flushPending(ctx, []),
					head: `${ctx.indent}while ${cond} do`,
					body: s.body,
					tail: `${ctx.indent}end`,
				};
			}, ctx);
		case "Repeat":
			return emitLoopWithContinue(() => {
				const count = emitExpr(s.count, ctx);
				return {
					pending: flushPending(ctx, []),
					head: `${ctx.indent}for __i = 1, ${count} do`,
					body: s.body,
					tail: `${ctx.indent}end`,
				};
			}, ctx);
		case "Break":
			if (ctx.loopDepth <= 0)
				throw new Error('"break" used outside loop.');
			if (ctx.loopBreakFlags.length > 0) {
				const flag = ctx.loopBreakFlags[ctx.loopBreakFlags.length - 1]!;
				return [`${ctx.indent}${flag} = true`, `${ctx.indent}break`];
			}
			return [`${ctx.indent}break`];
		case "Continue":
			if (ctx.loopDepth <= 0)
				throw new Error('"continue" used outside loop.');
			return [`${ctx.indent}break`];
		case "Lua": {
			const exposed = findLuaExposedVars(s.source).filter(
				(n) => !ctx.locals.has(n),
			);
			const lines = s.source.replace(/^\n+|\n+$/g, "").split("\n");
			const indent =
				lines.find((l) => l.trim().length > 0)?.match(/^\s*/)?.[0] ??
				"";
			const inLua = `${ctx.indent}${IND_STEP}`;
			const out: string[] = [];
			for (const name of exposed) {
				ctx.locals.add(name);
				ctx.varKinds.set(name, "unknown");
				out.push(`${ctx.indent}local ${name}`);
			}
			out.push(`${ctx.indent}do`);
			for (const line of lines) {
				const stripped =
					indent && line.startsWith(indent)
						? line.slice(indent.length)
						: line.trimStart();
				out.push(stripped.length === 0 ? "" : `${inLua}${stripped}`);
			}
			out.push(`${ctx.indent}end`);
			return out;
		}
		case "Try": {
			const out: string[] = [];
			ctx.coerceTempId += 1;
			const id = ctx.coerceTempId;
			const ok = `__estelle_try_ok_${id}`;
			const err = `__estelle_try_err_${id}`;
			out.push(`${ctx.indent}local ${ok}, ${err} = pcall(function()`);
			for (const inner of s.tryBody) out.push(...emitStmt(inner, ctx));
			out.push(`${ctx.indent}end)`);
			if (s.catchBody) {
				out.push(`${ctx.indent}if not ${ok} then`);
				if (s.catchVar) {
					if (!ctx.locals.has(s.catchVar)) {
						ctx.locals.add(s.catchVar);
						ctx.varKinds.set(s.catchVar, "unknown");
						out.push(`${ctx.indent}local ${s.catchVar} = ${err}`);
					} else {
						out.push(`${ctx.indent}${s.catchVar} = ${err}`);
					}
				}
				for (const inner of s.catchBody)
					out.push(...emitStmt(inner, ctx));
				out.push(`${ctx.indent}end`);
			} else {
				out.push(`${ctx.indent}if not ${ok} then error(${err}) end`);
			}
			return out;
		}
		case "NestFnc": {
			const nf = s.fnc;
			ctx.locals.add(nf.name);
			const innerLocals = new Set(ctx.locals);
			for (const p of nf.params) innerLocals.add(p.name);
			const innerVarKinds = new Map(ctx.varKinds);
			for (const p of nf.params)
				innerVarKinds.set(p.name, mapTypeToKind(p.type));
			const innerCtx: EmitCtx = {
				invokeScoped: ctx.invokeScoped,
				usesOutput: ctx.usesOutput,
				invokeEntries: ctx.invokeEntries,
				globalAliases: ctx.globalAliases,
				runtimeHelpers: ctx.runtimeHelpers,
				coerceTempId: ctx.coerceTempId,
				loopDepth: 0,
				loopBreakFlags: [],
				locals: innerLocals,
				varKinds: innerVarKinds,
				lambdaBindings: [...ctx.lambdaBindings],
				pageTemps: new Map(),
				pendingLines: [],
				indent: ctx.indent + IND_STEP,
			};
			const ps = nf.params.map((p) => p.name).join(", ");
			const open = flushPending(ctx, [
				`${ctx.indent}local function ${nf.name}(${ps})`,
			]);
			const bodyLines = nf.body.flatMap((st) => emitStmt(st, innerCtx));
			const after = flushPending(innerCtx, []);
			return [...open, ...bodyLines, ...after, `${ctx.indent}end`];
		}
	}
}

function findLuaExposedVars(text: string): string[] {
	const stripped = text
		.replace(/--\[\[[\s\S]*?\]\]/g, "")
		.replace(/--[^\n]*/g, "")
		.replace(/"(?:\\.|[^"\\])*"/g, '""')
		.replace(/'(?:\\.|[^'\\])*'/g, "''");
	const seen = new Set<string>();
	for (const line of stripped.split("\n")) {
		const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=[^=]/);
		if (!m) continue;
		if (/^\s*local\b/.test(line)) continue;
		seen.add(m[1]!);
	}
	return [...seen];
}

function hasContinue(stmt: Stmt): boolean {
	switch (stmt.kind) {
		case "Continue":
			return true;
		case "NestFnc":
			return stmt.fnc.body.some(hasContinue);
		case "If":
			return (
				stmt.branches.some((b) => b.body.some(hasContinue)) ||
				(stmt.elseBody?.some(hasContinue) ?? false)
			);
		case "Try":
			return (
				stmt.tryBody.some(hasContinue) ||
				(stmt.catchBody?.some(hasContinue) ?? false)
			);
		case "Lua":
		case "ForIn":
		case "While":
		case "Repeat":
			return false;
		default:
			return false;
	}
}

function emitLoopWithContinue(
	make: () => {
		pending: string[];
		head: string;
		body: readonly Stmt[];
		tail: string;
	},
	ctx: EmitCtx,
): string[] {
	const loop = make();
	const bodyHasContinue = loop.body.some(hasContinue);

	const out: string[] = [...loop.pending, loop.head];
	const savedIndent = ctx.indent;
	ctx.indent = ctx.indent + IND_STEP;
	ctx.loopDepth += 1;
	try {
		if (bodyHasContinue) {
			ctx.coerceTempId += 1;
			const breakFlag = `__estelle_loop_break_${ctx.coerceTempId}`;
			out.push(`${ctx.indent}local ${breakFlag} = false`);
			ctx.loopBreakFlags.push(breakFlag);
			out.push(`${ctx.indent}repeat`);
			for (const inner of loop.body) out.push(...emitStmt(inner, ctx));
			out.push(`${ctx.indent}until true`);
			ctx.loopBreakFlags.pop();
			out.push(`${ctx.indent}if ${breakFlag} then break end`);
		} else {
			for (const inner of loop.body) out.push(...emitStmt(inner, ctx));
		}
	} finally {
		ctx.indent = savedIndent;
		ctx.loopDepth -= 1;
	}
	out.push(loop.tail);
	return out;
}

function exprUsesArg(e: Expr): boolean {
	if (e.kind === "Call") {
		if (e.callee.kind === "Ident" && e.callee.name === "arg") return true;
		if (exprUsesArg(e.callee)) return true;
		return e.args.some(exprUsesArg);
	}
	if (e.kind === "MethodCall") {
		if (exprUsesArg(e.object)) return true;
		if (e.form.kind === "args") return e.form.args.some(exprUsesArg);
		return exprUsesArg(e.form.table);
	}
	if (e.kind === "Member") return exprUsesArg(e.object);
	if (e.kind === "Index")
		return exprUsesArg(e.object) || exprUsesArg(e.index);
	if (e.kind === "List") return e.items.some(exprUsesArg);
	if (e.kind === "Map") return e.entries.some((en) => exprUsesArg(en.value));
	if (e.kind === "Binary") return exprUsesArg(e.left) || exprUsesArg(e.right);
	if (e.kind === "Unary") return exprUsesArg(e.right);
	if (e.kind === "Lambda") return exprUsesArg(e.body);
	return false;
}

function stmtsUseArg(stmts: readonly Stmt[]): boolean {
	for (const s of stmts) {
		if (s.kind === "Assign") {
			const t = s.target;
			if (
				(t.kind === "Member" && exprUsesArg(t.object)) ||
				(t.kind === "Index" &&
					(exprUsesArg(t.object) || exprUsesArg(t.index)))
			)
				return true;
			if (exprUsesArg(s.value)) return true;
		}
		if (s.kind === "Output" && exprUsesArg(s.value)) return true;
		if (s.kind === "Return" && s.value && exprUsesArg(s.value)) return true;
		if (s.kind === "ExprStmt" && exprUsesArg(s.expr)) return true;
		if (s.kind === "If") {
			if (
				s.branches.some(
					(b) => exprUsesArg(b.condition) || stmtsUseArg(b.body),
				)
			)
				return true;
			if (s.elseBody && stmtsUseArg(s.elseBody)) return true;
		}
		if (
			(s.kind === "ForIn" &&
				(exprUsesArg(s.iterable) || stmtsUseArg(s.body))) ||
			(s.kind === "While" &&
				(exprUsesArg(s.condition) || stmtsUseArg(s.body))) ||
			(s.kind === "Repeat" &&
				(exprUsesArg(s.count) || stmtsUseArg(s.body)))
		)
			return true;
		if (s.kind === "Try") {
			if (stmtsUseArg(s.tryBody)) return true;
			if (s.catchBody && stmtsUseArg(s.catchBody)) return true;
		}
		if (s.kind === "NestFnc") {
			if (stmtsUseArg(s.fnc.body)) return true;
			continue;
		}
	}
	return false;
}

function stmtsUseOutput(stmts: readonly Stmt[]): boolean {
	for (const s of stmts) {
		if (s.kind === "Output" || s.kind === "OutputBlock") return true;
		if (s.kind === "If") {
			if (s.branches.some((b) => stmtsUseOutput(b.body))) return true;
			if (s.elseBody && stmtsUseOutput(s.elseBody)) return true;
		}
		if (
			(s.kind === "ForIn" || s.kind === "While" || s.kind === "Repeat") &&
			stmtsUseOutput(s.body)
		)
			return true;
		if (s.kind === "Try") {
			if (stmtsUseOutput(s.tryBody)) return true;
			if (s.catchBody && stmtsUseOutput(s.catchBody)) return true;
		}
		if (s.kind === "NestFnc") {
			if (stmtsUseOutput(s.fnc.body)) return true;
			continue;
		}
	}
	return false;
}

function buildInvokePrelude(useArg: boolean, useOutput: boolean): string {
	const lines: string[] = [];
	if (useArg) {
		lines.push(
			"    local _fargs = frame.args",
			"    local _parent = frame:getParent()",
			"    local _pargs = (_parent and _parent.args) or {}",
			"    local function _arg(key, default)",
			"        local v = _fargs[key]",
			"        if v == nil then v = _pargs[key] end",
			'        if type(v) == "string" then',
			'            v = v:match("^%s*(.-)%s*$")',
			'            if v == "" then v = nil end',
			"        end",
			"        if v == nil then return default end",
			"        return v",
			"    end",
		);
	}
	if (useOutput) {
		lines.push("    local _out = {}");
	}
	return lines.length ? lines.join("\n") + "\n" : "";
}

function emitRegularFnc(
	f: FncDecl,
	invokeEntries: ReadonlySet<string>,
	runtimeHelpers: Set<RuntimeHelper>,
): string {
	const globalAliases = buildGlobalAliases(f.body);
	const varKinds = new Map<string, ValueKind>();
	for (const p of f.params) varKinds.set(p.name, mapTypeToKind(p.type));
	const ctx: EmitCtx = {
		invokeScoped: false,
		usesOutput: false,
		invokeEntries,
		globalAliases,
		runtimeHelpers,
		coerceTempId: 0,
		loopDepth: 0,
		loopBreakFlags: [],
		locals: new Set(f.params.map((p) => p.name)),
		varKinds,
		lambdaBindings: [],
		pageTemps: new Map(),
		pendingLines: [],
		indent: IND_STEP,
	};
	const body = f.body.flatMap((stmt) => emitStmt(stmt, ctx)).join("\n");
	const aliasLines = emitGlobalAliasLines(globalAliases, IND_STEP);
	const bodyParts: string[] = [];
	if (aliasLines.length > 0) bodyParts.push(aliasLines.join("\n"));
	if (body) bodyParts.push(body);
	const bodyPart = bodyParts.length > 0 ? `\n${bodyParts.join("\n")}` : "";

	const params = f.params.map((p) => p.name).join(", ");
	return `local function ${f.name}(${params})${bodyPart}\nend`;
}

function emitInvokeFnc(
	f: FncDecl,
	invokeEntries: ReadonlySet<string>,
	runtimeHelpers: Set<RuntimeHelper>,
): string {
	const globalAliases = buildGlobalAliases(f.body);
	const useArg = stmtsUseArg(f.body);
	const useOutput = stmtsUseOutput(f.body);
	const varKinds = new Map<string, ValueKind>();
	for (const p of f.params) varKinds.set(p.name, mapTypeToKind(p.type));
	const ctx: EmitCtx = {
		invokeScoped: true,
		usesOutput: useOutput,
		invokeEntries,
		globalAliases,
		runtimeHelpers,
		coerceTempId: 0,
		loopDepth: 0,
		loopBreakFlags: [],
		locals: new Set(f.params.map((p) => p.name)),
		varKinds,
		lambdaBindings: [],
		pageTemps: new Map(),
		pendingLines: [],
		indent: IND_STEP,
	};
	const body = f.body.flatMap((stmt) => emitStmt(stmt, ctx)).join("\n");
	const preludeLines = buildInvokePrelude(useArg, useOutput)
		.split("\n")
		.filter((line) => line.length > 0);
	preludeLines.push(...emitGlobalAliasLines(globalAliases, IND_STEP));
	const prelude =
		preludeLines.length > 0 ? `${preludeLines.join("\n")}\n` : "";
	const bodyPart = body ? (prelude ? "\n" + body : body) : "";
	const endsWithReturn = f.body[f.body.length - 1]?.kind === "Return";
	const tail = endsWithReturn
		? ""
		: useOutput
			? `\n    return ${INVOKE_OUTPUT_RETURN_EXPR}`
			: '\n    return ""';
	return `${f.name} = function(frame)\n${prelude}${bodyPart}${tail}\nend\np.${f.name} = ${f.name}`;
}

export function emitLua(program: Program): string {
	const out: string[] = ["local p = {}"];
	const runtimeHelpers = new Set<RuntimeHelper>();

	if (program.imports.length) {
		out.push("");
		for (const imp of program.imports)
			out.push(`local ${imp.alias} = require("${imp.path}")`);
	}

	const invokeEntries = new Set(
		program.fncs
			.filter((f) => f.pub || f.name === "main")
			.map((f) => f.name),
	);
	const invokeOrder = program.fncs
		.filter((f) => f.pub || f.name === "main")
		.map((f) => f.name);
	if (invokeOrder.length > 0) {
		out.push("");
		out.push(`local ${invokeOrder.join(", ")}`);
	}

	const fnOut: string[] = [];
	for (const fnc of program.fncs) {
		fnOut.push("");
		if (invokeEntries.has(fnc.name))
			fnOut.push(emitInvokeFnc(fnc, invokeEntries, runtimeHelpers));
		else fnOut.push(emitRegularFnc(fnc, invokeEntries, runtimeHelpers));
	}

	const helpersToEmit = RUNTIME_HELPER_ORDER.filter((h) =>
		runtimeHelpers.has(h),
	);
	if (helpersToEmit.length > 0) {
		out.push("");
		for (const helper of helpersToEmit) {
			out.push(emitRuntimeHelper(helper), "");
		}
		if (out[out.length - 1] === "") out.pop();
	}
	out.push(...fnOut);

	out.push("", "return p");
	return out
		.join("\n")
		.replace(/^(?: {4})+/gm, (m) => "\t".repeat(m.length / 4));
}
