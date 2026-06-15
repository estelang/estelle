import { TK, type Token } from "../lexer/index.ts";
import type { Expr } from "../ast/index.ts";
import type { EstelleType } from "../ast/program.ts";

export interface ExprParseContext {
	cur(): Token;
	peek(): TK;
	advance(): Token;
	eat(t: TK): boolean;
	expect(t: TK, msg: string): Token;
	expectName(msg: string): Token;
	err(msg: string): void;
	getPos(): number;
	setPos(pos: number): void;
	nameIsCompilerReserved(name: string): boolean;
	nameIsLanguageReserved(name: string): boolean;
	nameDiag(tok: Token, msg: string): void;
}

export function parseExprWithContext(ctx: ExprParseContext): Expr {
	return parsePipe(ctx);
}

export function parsePostfixWithContext(
	ctx: ExprParseContext,
	base: Expr,
): Expr {
	return parsePostfix(ctx, base);
}

function parseTypeKeyword(ctx: ExprParseContext): EstelleType | null {
	switch (ctx.peek()) {
		case TK.StrType:
			ctx.advance();
			return "str";
		case TK.NumType:
			ctx.advance();
			return "num";
		case TK.BoolType:
			ctx.advance();
			return "bool";
		case TK.ListType:
			ctx.advance();
			return "list";
		case TK.MapType:
			ctx.advance();
			return "map";
		default:
			return null;
	}
}

function parsePipe(ctx: ExprParseContext): Expr {
	let expr = parseOr(ctx);
	while (ctx.eat(TK.Pipe)) {
		const name = ctx.expectName('Expected function name after "|"').value;
		if (name === "default" && ctx.peek() !== TK.LParen)
			ctx.err('default pipe requires a value: | default("...")');
		const callee: Expr = { kind: "Ident", name };
		const args: Expr[] = [expr];
		if (ctx.eat(TK.LParen)) {
			while (ctx.peek() !== TK.RParen && ctx.peek() !== TK.Eof) {
				args.push(parseExprWithContext(ctx));
				if (!ctx.eat(TK.Comma)) break;
			}
			ctx.expect(TK.RParen, 'Expected ")" after pipe args');
		}
		expr = { kind: "Call", callee, args };
	}
	return expr;
}

function parseOr(ctx: ExprParseContext): Expr {
	let expr = parseAnd(ctx);
	while (ctx.eat(TK.Or))
		expr = { kind: "Binary", op: "or", left: expr, right: parseAnd(ctx) };
	return expr;
}

function parseAnd(ctx: ExprParseContext): Expr {
	let expr = parseCompare(ctx);
	while (ctx.eat(TK.And))
		expr = {
			kind: "Binary",
			op: "and",
			left: expr,
			right: parseCompare(ctx),
		};
	return expr;
}

function parseConcat(ctx: ExprParseContext): Expr {
	let expr = parseAdd(ctx);
	while (ctx.eat(TK.DotDot))
		expr = { kind: "Binary", op: "..", left: expr, right: parseAdd(ctx) };
	return expr;
}

function parseCompare(ctx: ExprParseContext): Expr {
	let expr = parseConcat(ctx);
	while (true) {
		if (ctx.eat(TK.EqEq)) {
			expr = {
				kind: "Binary",
				op: "==",
				left: expr,
				right: parseAdd(ctx),
			};
			continue;
		}
		if (ctx.eat(TK.BangEq)) {
			expr = {
				kind: "Binary",
				op: "!=",
				left: expr,
				right: parseAdd(ctx),
			};
			continue;
		}
		if (ctx.eat(TK.GtEq)) {
			expr = {
				kind: "Binary",
				op: ">=",
				left: expr,
				right: parseAdd(ctx),
			};
			continue;
		}
		if (ctx.eat(TK.LtEq)) {
			expr = {
				kind: "Binary",
				op: "<=",
				left: expr,
				right: parseAdd(ctx),
			};
			continue;
		}
		if (ctx.eat(TK.Gt)) {
			expr = {
				kind: "Binary",
				op: ">",
				left: expr,
				right: parseAdd(ctx),
			};
			continue;
		}
		if (ctx.eat(TK.Lt)) {
			expr = {
				kind: "Binary",
				op: "<",
				left: expr,
				right: parseAdd(ctx),
			};
			continue;
		}
		break;
	}
	return expr;
}

function parseAdd(ctx: ExprParseContext): Expr {
	let expr = parseMul(ctx);
	while (true) {
		if (ctx.eat(TK.Plus)) {
			expr = {
				kind: "Binary",
				op: "+",
				left: expr,
				right: parseMul(ctx),
			};
			continue;
		}
		if (ctx.eat(TK.Minus)) {
			expr = {
				kind: "Binary",
				op: "-",
				left: expr,
				right: parseMul(ctx),
			};
			continue;
		}
		break;
	}
	return expr;
}

function parseMul(ctx: ExprParseContext): Expr {
	let expr = parseUnary(ctx);
	while (true) {
		if (ctx.eat(TK.Star)) {
			expr = {
				kind: "Binary",
				op: "*",
				left: expr,
				right: parseUnary(ctx),
			};
			continue;
		}
		if (ctx.eat(TK.Slash)) {
			expr = {
				kind: "Binary",
				op: "/",
				left: expr,
				right: parseUnary(ctx),
			};
			continue;
		}
		if (ctx.eat(TK.Percent)) {
			expr = {
				kind: "Binary",
				op: "%",
				left: expr,
				right: parseUnary(ctx),
			};
			continue;
		}
		break;
	}
	return expr;
}

function parseUnary(ctx: ExprParseContext): Expr {
	if (ctx.eat(TK.Not))
		return { kind: "Unary", op: "not", right: parseUnary(ctx) };
	if (ctx.eat(TK.Minus))
		return { kind: "Unary", op: "-", right: parseUnary(ctx) };
	let expr = parsePostfix(ctx, parsePrimary(ctx));
	if (ctx.eat(TK.As)) {
		const type = parseTypeKeyword(ctx);
		if (type === null) ctx.err('Expected type after "as"');
		else expr = { kind: "Coerce", expr, type };
	}
	return expr;
}

function parsePrimary(ctx: ExprParseContext): Expr {
	const tok = ctx.cur();
	switch (ctx.peek()) {
		case TK.String:
			ctx.advance();
			return { kind: "String", value: tok.value };
		case TK.Number:
			ctx.advance();
			return { kind: "Number", value: parseFloat(tok.value) };
		case TK.True:
			ctx.advance();
			return { kind: "Bool", value: true };
		case TK.False:
			ctx.advance();
			return { kind: "Bool", value: false };
		case TK.Nil:
			ctx.advance();
			return { kind: "Nil" };
		case TK.LParen: {
			const saved = ctx.getPos();
			ctx.advance();
			if (ctx.peek() === TK.RParen) {
				ctx.advance();
				if (ctx.eat(TK.Arrow))
					return {
						kind: "Lambda",
						params: [],
						body: parseExprWithContext(ctx),
					};
				ctx.err('Expected "=>" after "()" (zero-argument lambda)');
				ctx.setPos(saved);
				ctx.advance();
				const e = parseExprWithContext(ctx);
				ctx.expect(TK.RParen, 'Expected ")"');
				return e;
			}
			if (ctx.peek() !== TK.Ident) {
				const e = parseExprWithContext(ctx);
				ctx.expect(TK.RParen, 'Expected ")"');
				return e;
			}
			const names: string[] = [];
			while (ctx.peek() === TK.Ident) {
				const ptok = ctx.advance();
				const pname = ptok.value;
				if (ctx.nameIsLanguageReserved(pname))
					ctx.nameDiag(
						ptok,
						`Lambda parameter "${pname}" is reserved by Estelle.`,
					);
				if (ctx.nameIsCompilerReserved(pname))
					ctx.nameDiag(
						ptok,
						`Lambda parameter "${pname}" is reserved for compiler internals.`,
					);
				names.push(pname);
				if (!ctx.eat(TK.Comma)) break;
				if (ctx.peek() === TK.RParen) {
					ctx.err("Trailing comma in lambda parameter list");
					break;
				}
			}
			if (ctx.peek() !== TK.RParen) {
				ctx.setPos(saved);
				ctx.advance();
				const e = parseExprWithContext(ctx);
				ctx.expect(TK.RParen, 'Expected ")"');
				return e;
			}
			ctx.advance();
			if (!ctx.eat(TK.Arrow)) {
				ctx.setPos(saved);
				ctx.advance();
				const e = parseExprWithContext(ctx);
				ctx.expect(TK.RParen, 'Expected ")"');
				return e;
			}
			const seen = new Set<string>();
			for (const n of names) {
				if (seen.has(n)) ctx.err(`Duplicate lambda parameter "${n}"`);
				seen.add(n);
			}
			return {
				kind: "Lambda",
				params: names,
				body: parseExprWithContext(ctx),
			};
		}
		case TK.LBracket:
			return parseListLiteral(ctx);
		case TK.LBrace:
			return parseMapLiteral(ctx);
		case TK.Ident:
		case TK.StrType:
		case TK.NumType:
		case TK.BoolType:
		case TK.ListType:
		case TK.MapType:
			ctx.advance();
			return { kind: "Ident", name: tok.value };
		case TK.Question:
			ctx.err('Unexpected "?"');
			ctx.advance();
			return { kind: "Nil" };
		default:
			ctx.err(`Unexpected token "${tok.value}" in expression`);
			ctx.advance();
			return { kind: "Nil" };
	}
}

function parsePostfix(ctx: ExprParseContext, base: Expr): Expr {
	let expr = base;
	while (true) {
		if (ctx.eat(TK.Dot)) {
			const name = ctx.expectName('Expected member name after "."').value;
			expr = { kind: "Member", object: expr, property: name };
			continue;
		}
		if (ctx.eat(TK.LBracket)) {
			const index = parseExprWithContext(ctx);
			ctx.expect(TK.RBracket, 'Expected "]"');
			expr = { kind: "Index", object: expr, index };
			continue;
		}
		if (ctx.eat(TK.Colon)) {
			const method = ctx.expectName(
				'Expected method name after ":"',
			).value;
			if (ctx.peek() === TK.LParen) {
				ctx.advance();
				const args: Expr[] = [];
				while (ctx.peek() !== TK.RParen && ctx.peek() !== TK.Eof) {
					args.push(parseExprWithContext(ctx));
					if (!ctx.eat(TK.Comma)) break;
				}
				ctx.expect(TK.RParen, 'Expected ")"');
				expr = {
					kind: "MethodCall",
					object: expr,
					method,
					form: { kind: "args", args },
				};
				continue;
			}
			if (ctx.peek() === TK.LBrace) {
				const table = parseMapLiteral(ctx);
				expr = {
					kind: "MethodCall",
					object: expr,
					method,
					form: { kind: "table", table },
				};
				continue;
			}
			ctx.err('Expected "(" or "{" after method name');
			break;
		}
		if (ctx.peek() === TK.LParen) {
			expr = parseCall(ctx, expr);
			continue;
		}
		break;
	}
	return expr;
}

function parseCall(ctx: ExprParseContext, callee: Expr): Expr {
	ctx.expect(TK.LParen, 'Expected "("');
	const args: Expr[] = [];
	while (ctx.peek() !== TK.RParen && ctx.peek() !== TK.Eof) {
		args.push(parseExprWithContext(ctx));
		if (!ctx.eat(TK.Comma)) break;
	}
	ctx.expect(TK.RParen, 'Expected ")"');
	return { kind: "Call", callee, args };
}

function parseListLiteral(ctx: ExprParseContext): Expr {
	ctx.expect(TK.LBracket, 'Expected "["');
	const items: Expr[] = [];
	while (ctx.peek() !== TK.RBracket && ctx.peek() !== TK.Eof) {
		items.push(parseExprWithContext(ctx));
		if (!ctx.eat(TK.Comma)) break;
	}
	ctx.expect(TK.RBracket, 'Expected "]"');
	return { kind: "List", items };
}

function parseMapLiteral(ctx: ExprParseContext): Expr {
	ctx.expect(TK.LBrace, 'Expected "{"');
	const entries: { key: string; value: Expr }[] = [];
	while (ctx.peek() !== TK.RBrace && ctx.peek() !== TK.Eof) {
		const key = ctx.expectName("Expected map key").value;
		ctx.expect(TK.Colon, 'Expected ":" after map key');
		const value = parseExprWithContext(ctx);
		entries.push({ key, value });
		if (!ctx.eat(TK.Comma)) break;
	}
	ctx.expect(TK.RBrace, 'Expected "}"');
	return { kind: "Map", entries };
}
