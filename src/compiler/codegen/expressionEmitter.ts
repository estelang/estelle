import type { Expr } from "../ast/index.ts";
import { lex } from "../lexer/index.ts";
import { parseExpression } from "../parser/index.ts";
import { emitGlobalCall, useRuntimeHelper } from "./runtime.ts";
import type { EmitCtx, ValueKind } from "./types.ts";

const NAMESPACE_IDENTIFIERS: Readonly<Record<string, string>> = {
	hash: "mw.hash",
	html: "mw.html",
	language: "mw.language",
	message: "mw.message",
	site: "mw.site",
	svg: "mw.svg",
	text: "mw.text",
	title: "mw.title",
	uri: "mw.uri",
	ustring: "mw.ustring",
};

function thinLambdaBindsIdent(name: string, ctx: EmitCtx): boolean {
	for (let i = ctx.lambdaBindings.length - 1; i >= 0; i--) {
		if (ctx.lambdaBindings[i]!.has(name)) return true;
	}
	return false;
}

function emitString(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function emitInterpolationExpr(source: string, ctx: EmitCtx): string {
	const parsed = parseExpression(lex(source));
	if (!parsed.ok) {
		const first =
			parsed.diagnostics[0]?.message ??
			"invalid interpolation expression";
		throw new Error(
			`Invalid interpolation expression "\${${source}}": ${first}`,
		);
	}
	return emitExpr(parsed.expr, ctx);
}

function findInterpClose(value: string, start: number): number {
	let depth = 1,
		i = start;
	while (i < value.length) {
		const c = value[i];
		if (c === '"' || c === "'") {
			const q = c;
			i++;
			while (i < value.length && value[i] !== q) {
				if (value[i] === "\\") i++;
				i++;
			}
		} else if (c === "{") {
			depth++;
		} else if (c === "}") {
			if (--depth === 0) return i;
		}
		i++;
	}
	return -1;
}

export function emitInterpolatedString(value: string, ctx: EmitCtx): string {
	if (!value.includes("${")) return emitString(value);
	const out: string[] = [];
	let lit = "";
	let i = 0;
	while (i < value.length) {
		const open = value.indexOf("${", i);
		if (open === -1) {
			lit += value.slice(i);
			break;
		}
		lit += value.slice(i, open);
		const close = findInterpClose(value, open + 2);
		if (close === -1) {
			lit += value.slice(open);
			break;
		}
		if (lit) {
			out.push(emitString(lit));
			lit = "";
		}
		const inner = value.slice(open + 2, close).trim();
		out.push(`tostring(${emitInterpolationExpr(inner, ctx)})`);
		i = close + 1;
	}
	if (lit) out.push(emitString(lit));
	return out.filter((part) => part !== '""').join(" .. ") || '""';
}

export function inferExprKind(e: Expr, ctx: EmitCtx): ValueKind {
	switch (e.kind) {
		case "String":
			return "str";
		case "Number":
			return "num";
		case "Bool":
			return "bool";
		case "Nil":
			return "unknown";
		case "List":
			return "list";
		case "Map":
			return "map";
		case "Ident":
			if (thinLambdaBindsIdent(e.name, ctx)) return "unknown";
			return ctx.varKinds.get(e.name) ?? "unknown";
		case "Member":
		case "Index":
			return "unknown";
		case "Lambda":
			return "unknown";
		case "Unary":
			return e.op === "not" ? "bool" : "num";
		case "Binary":
			if (["==", "!=", ">", "<", ">=", "<=", "and", "or"].includes(e.op))
				return "bool";
			if (e.op === "..") return "str";
			if (e.op === "+") {
				const lk = inferExprKind(e.left, ctx);
				const rk = inferExprKind(e.right, ctx);
				if (lk === "list" || rk === "list") return "list";
				return "num";
			}
			if (["*", "/", "%", "-"].includes(e.op)) return "num";
			return "unknown";
		case "Call": {
			const name = e.callee.kind === "Ident" ? e.callee.name : null;
			const nsRoot =
				e.callee.kind === "Member" && e.callee.object.kind === "Ident"
					? e.callee.object.name
					: null;
			const nsMethod =
				e.callee.kind === "Member" ? e.callee.property : null;
			if (name === "arg") return "str";
			if (name === "page" || name === "currentpage") return "title";
			if (
				name === "addWarning" ||
				name === "allToString" ||
				name === "dumpObject"
			)
				return "str";
			if (name === "loadData" || name === "loadJsonData") return "map";
			if (
				nsRoot === "message" &&
				(nsMethod === "new" ||
					nsMethod === "newRawMessage" ||
					nsMethod === "newFallbackSequence")
			)
				return "message";
			if (nsRoot === "message" && nsMethod === "rawParam") return "str";
			if (nsRoot === "message" && nsMethod === "numParam") return "num";
			if (nsRoot === "message" && nsMethod === "getDefaultLanguage")
				return "unknown";
			if (nsRoot === "language") {
				switch (nsMethod) {
					case "fetchLanguageName":
					case "getContentLanguage":
					case "fetchLanguageNames":
						return "str";
					case "isKnownLanguageTag":
					case "isSupportedLanguage":
					case "isValidBuiltInCode":
					case "isValidCode":
						return "bool";
					case "getFallbacksFor":
						return "list";
					default:
						return "unknown";
				}
			}
			if (
				nsRoot === "title" &&
				(nsMethod === "new" || nsMethod === "getCurrentTitle")
			)
				return "title";
			if (nsRoot === "text" && nsMethod === "split") return "list";
			if (nsRoot === "uri" && nsMethod === "buildQueryString")
				return "str";
			if (nsRoot === "uri" && nsMethod === "parseQueryString")
				return "map";
			if (nsRoot === "uri" && nsMethod === "validate") return "bool";
			if (
				nsRoot === "ustring" &&
				(nsMethod === "lower" ||
					nsMethod === "upper" ||
					nsMethod === "sub" ||
					nsMethod === "format" ||
					nsMethod === "rep" ||
					nsMethod === "toNFC" ||
					nsMethod === "toNFD" ||
					nsMethod === "toNFKC" ||
					nsMethod === "toNFKD")
			)
				return "str";
			if (nsRoot === "ustring" && nsMethod === "len") return "num";
			if (nsRoot === "ustring" && nsMethod === "isutf8") return "bool";
			if (
				[
					"trim",
					"lower",
					"upper",
					"sub",
					"find",
					"replace",
					"join",
					"padleft",
					"padright",
					"tostr",
					"addWarning",
					"allToString",
					"dumpObject",
				].includes(name ?? "")
			)
				return "str";
			if (
				["floor", "ceil", "abs", "round", "tonum", "len"].includes(
					name ?? "",
				)
			)
				return "num";
			if (name === "split") return "list";
			return "unknown";
		}
		case "MethodCall": {
			const objKind = inferExprKind(e.object, ctx);
			if (objKind === "title") {
				switch (e.method) {
					case "equals":
						return "bool";
					case "compare":
						return "num";
					case "getCurrentTitle":
					case "new":
						return "title";
					case "fullUrl":
					case "localUrl":
					case "canonicalUrl":
						return "str";
					case "content":
						return "str";
					default:
						return "unknown";
				}
			}
			if (objKind === "message") {
				switch (e.method) {
					case "plain":
					case "rawParam":
						return "str";
					case "exists":
					case "isBlank":
					case "isDisabled":
						return "bool";
					case "numParams":
						return "num";
					case "params":
					case "rawParams":
						return "list";
					default:
						return "message";
				}
			}
			if (objKind === "language") {
				switch (e.method) {
					case "getCode":
					case "toBcp47Code":
					case "lc":
					case "uc":
					case "lcfirst":
					case "ucfirst":
						return "str";
					case "isRTL":
						return "bool";
					default:
						return "unknown";
				}
			}
			return "unknown";
		}
	}
}

function emitLenCall(arg: Expr, ctx: EmitCtx): string {
	const argCode = emitExpr(arg, ctx);
	const kind = inferExprKind(arg, ctx);
	if (kind === "list") return `#${argCode}`;
	if (kind === "str") return emitGlobalCall("mw.ustring.len", [argCode], ctx);
	throw new Error(
		"len(...) is ambiguous: prove list vs string before lowering.",
	);
}

function isPotentialMultiReturn(e: Expr): boolean {
	return (
		e.kind === "Call" &&
		e.callee.kind === "Ident" &&
		(e.callee.name === "replace" || e.callee.name === "find")
	);
}

function emitArgForCallSite(
	arg: Expr,
	argsLen: number,
	index: number,
	ctx: EmitCtx,
): string {
	const code = emitExpr(arg, ctx);
	if (argsLen === 1 && index === 0 && isPotentialMultiReturn(arg))
		return `(${code})`;
	return code;
}

function emitBuiltinCall(
	name: string,
	args: readonly Expr[],
	ctx: EmitCtx,
): string | null {
	const a = (i: number) => emitArgForCallSite(args[i]!, args.length, i, ctx);
	const allArgs = args.map((_, i) => a(i));
	const currentFrame = "mw.getCurrentFrame()";
	switch (name) {
		case "trim":
			return emitGlobalCall("mw.text.trim", [a(0)], ctx);
		case "lower":
			return emitGlobalCall("mw.ustring.lower", [a(0)], ctx);
		case "upper":
			return emitGlobalCall("mw.ustring.upper", [a(0)], ctx);
		case "sub":
			return emitGlobalCall("mw.ustring.sub", [a(0), a(1), a(2)], ctx);
		case "find":
			return emitGlobalCall("mw.ustring.find", [a(0), a(1)], ctx);
		case "replace":
			return emitGlobalCall("mw.ustring.gsub", [a(0), a(1), a(2)], ctx);
		case "split":
			return emitGlobalCall("mw.text.split", [a(0), a(1)], ctx);
		case "join":
			return emitGlobalCall("table.concat", [a(0), a(1)], ctx);

		case "floor":
			return `math.floor(${a(0)})`;
		case "ceil":
			return `math.ceil(${a(0)})`;
		case "abs":
			return `math.abs(${a(0)})`;
		case "round":
			return `math.floor((${a(0)}) + 0.5)`;
		case "tonum":
			return `tonumber(${a(0)})`;
		case "tostr":
			return `tostring(${a(0)})`;
		case "len":
			return emitLenCall(args[0]!, ctx);
		case "push":
			return `table.insert(${a(0)}, ${a(1)})`;
		case "pop":
			return `table.remove(${a(0)})`;
		case "has":
			return `${useRuntimeHelper(ctx, "has")}(${a(0)}, ${a(1)})`;

		case "padleft": {
			const fill = args.length > 2 ? a(2) : "nil";
			return `${useRuntimeHelper(ctx, "padleft")}(${a(0)}, ${a(1)}, ${fill})`;
		}
		case "padright": {
			const fill = args.length > 2 ? a(2) : "nil";
			return `${useRuntimeHelper(ctx, "padright")}(${a(0)}, ${a(1)}, ${fill})`;
		}
		case "page": {
			const expr = a(0);
			const key = `page(${expr})`;
			const cached = ctx.pageTemps.get(key);
			if (cached) return cached;
			const temp = `__estelle_title_${ctx.pageTemps.size + 1}`;
			ctx.pageTemps.set(key, temp);
			ctx.locals.add(temp);
			ctx.varKinds.set(temp, "title");
			ctx.pendingLines.push(
				`${ctx.indent}local ${temp} = mw.title.new(${expr})`,
			);
			return temp;
		}
		case "currentpage":
			return "mw.title.getCurrentTitle()";
		case "addWarning":
			return emitGlobalCall("mw.addWarning", allArgs, ctx);
		case "allToString":
			return emitGlobalCall("mw.allToString", allArgs, ctx);
		case "clone":
			return emitGlobalCall("mw.clone", allArgs, ctx);
		case "getCurrentFrame":
			return currentFrame;
		case "incrementExpensiveFunctionCount":
			return emitGlobalCall(
				"mw.incrementExpensiveFunctionCount",
				allArgs,
				ctx,
			);
		case "isSubsting":
			return emitGlobalCall("mw.isSubsting", allArgs, ctx);
		case "loadData":
			return emitGlobalCall("mw.loadData", allArgs, ctx);
		case "loadJsonData":
			return emitGlobalCall("mw.loadJsonData", allArgs, ctx);
		case "dumpObject":
			return emitGlobalCall("mw.dumpObject", allArgs, ctx);
		case "log":
			return emitGlobalCall("mw.log", allArgs, ctx);
		case "logObject":
			return emitGlobalCall("mw.logObject", allArgs, ctx);
		default:
			return null;
	}
}

function isMethodReceiverParenRequired(e: Expr): boolean {
	switch (e.kind) {
		case "String":
		case "Number":
		case "Bool":
		case "Nil":
		case "List":
		case "Map":
		case "Binary":
		case "Unary":
			return true;
		case "Lambda":
			return true;
		default:
			return false;
	}
}

const BINARY_PRECEDENCE: Record<string, number> = {
	or: 1,
	and: 2,
	"==": 3,
	"!=": 3,
	"<": 3,
	">": 3,
	"<=": 3,
	">=": 3,
	"..": 4,
	"+": 5,
	"-": 5,
	"*": 6,
	"/": 6,
	"%": 6,
};
const LUA_MAP_IDENT_KEY = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function emitPrecedenceOfExpr(e: Expr): number {
	if (e.kind === "Unary") return 7;
	if (e.kind === "Binary") return BINARY_PRECEDENCE[e.op] ?? 0;
	if (
		e.kind === "MethodCall" ||
		e.kind === "Call" ||
		e.kind === "Member" ||
		e.kind === "Index"
	)
		return 8;
	return 9;
}

export function emitExpr(e: Expr, ctx: EmitCtx): string {
	switch (e.kind) {
		case "String":
			return emitInterpolatedString(e.value, ctx);
		case "Number":
			return String(e.value);
		case "Bool":
			return e.value ? "true" : "false";
		case "Nil":
			return "nil";
		case "Ident":
			if (thinLambdaBindsIdent(e.name, ctx)) return e.name;
			if (ctx.varKinds.has(e.name)) return e.name;
			return NAMESPACE_IDENTIFIERS[e.name] ?? e.name;
		case "Member": {
			const objectCode = emitExpr(e.object, ctx);
			const objectKind = inferExprKind(e.object, ctx);
			if (objectKind === "title" && e.property === "content")
				return `${objectCode}:getContent()`;
			return `${objectCode}.${e.property}`;
		}
		case "Index":
			return `${emitExpr(e.object, ctx)}[${emitExpr(e.index, ctx)}]`;
		case "List":
			return `{${e.items.map((it) => emitExpr(it, ctx)).join(", ")}}`;
		case "Map":
			return `{${e.entries
				.map((kv) =>
					LUA_MAP_IDENT_KEY.test(kv.key)
						? `${kv.key} = ${emitExpr(kv.value, ctx)}`
						: `[${emitString(kv.key)}] = ${emitExpr(kv.value, ctx)}`,
				)
				.join(", ")}}`;
		case "Call": {
			if (e.callee.kind === "Ident") {
				const builtin = emitBuiltinCall(e.callee.name, e.args, ctx);
				if (builtin) return builtin;
				const callee =
					ctx.invokeScoped && e.callee.name === "arg"
						? "_arg"
						: e.callee.name;
				const argsEmitted = e.args.map((arg, i) =>
					emitArgForCallSite(arg, e.args.length, i, ctx),
				);
				if (
					ctx.invokeScoped &&
					ctx.invokeEntries.has(e.callee.name) &&
					argsEmitted.length === 0
				)
					return `${callee}(frame)`;
				return `${callee}(${argsEmitted.join(", ")})`;
			}
			const callee = emitExpr(e.callee, ctx);
			return `${callee}(${e.args.map((arg, i) => emitArgForCallSite(arg, e.args.length, i, ctx)).join(", ")})`;
		}
		case "MethodCall": {
			const inner = emitExpr(e.object, ctx);
			const o = isMethodReceiverParenRequired(e.object)
				? `(${inner})`
				: inner;
			const f = e.form;
			if (f.kind === "table")
				return `${o}:${e.method}(${emitExpr(f.table, ctx)})`;
			const argsEmitted = f.args.map((arg, i) =>
				emitArgForCallSite(arg, f.args.length, i, ctx),
			);
			return `${o}:${e.method}(${argsEmitted.join(", ")})`;
		}
		case "Unary":
			return e.op === "not"
				? `(not ${emitExpr(e.right, ctx)})`
				: `(-${emitExpr(e.right, ctx)})`;
		case "Binary": {
			if (e.op === "+") {
				const lk = inferExprKind(e.left, ctx);
				const rk = inferExprKind(e.right, ctx);
				if (lk === "list" || rk === "list") {
					const l = emitExpr(e.left, ctx);
					const r = emitExpr(e.right, ctx);
					return `${useRuntimeHelper(ctx, "listConcat")}(${l}, ${r})`;
				}
			}
			const op = e.op === "!=" ? "~=" : e.op;
			const prec = BINARY_PRECEDENCE[e.op]!;

			const lp = emitPrecedenceOfExpr(e.left);
			const rp = emitPrecedenceOfExpr(e.right);
			let lStr = emitExpr(e.left, ctx);
			let rStr = emitExpr(e.right, ctx);
			if (lp < prec) lStr = `(${lStr})`;
			const rightAssoc = e.op === "..";
			if (rp < prec || (!rightAssoc && rp === prec)) rStr = `(${rStr})`;
			return `${lStr} ${op} ${rStr}`;
		}
		case "Lambda": {
			const ps = e.params;
			ctx.lambdaBindings.push(new Set(ps));
			let b: string;
			try {
				b = emitExpr(e.body, ctx);
			} finally {
				ctx.lambdaBindings.pop();
			}
			const plist = ps.join(", ");
			return ps.length === 0
				? `function() return ${b} end`
				: `function(${plist}) return ${b} end`;
		}
	}
}
