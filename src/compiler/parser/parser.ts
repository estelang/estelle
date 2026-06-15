import { type Token, TK } from "../lexer/index.ts";
import type {
	AssignTarget,
	EstelleType,
	ImportDecl,
	FncDecl,
	Param,
	Stmt,
	Expr,
} from "../ast/index.ts";
import type { CompileDiagnostic } from "../diagnostics.ts";
import type { ParseExprResult, ParseResult } from "./types.ts";
import {
	RESERVED_INTERNAL_NAMES,
	RESERVED_USER_NAMES,
	isBuiltinCallName,
} from "./constants.ts";
import {
	parseExprWithContext,
	parsePostfixWithContext,
	type ExprParseContext,
} from "./expressionParser.ts";

class Parser {
	private pos = 0;
	private readonly diags: CompileDiagnostic[] = [];
	private readonly tokens: readonly Token[];

	constructor(tokens: readonly Token[]) {
		this.tokens = tokens;
	}

	private cur(): Token {
		return this.tokens[this.pos];
	}
	private peek(): TK {
		return this.tokens[this.pos].type;
	}
	private advance(): Token {
		return this.tokens[this.pos++];
	}

	private eat(t: TK): boolean {
		if (this.peek() === t) {
			this.pos++;
			return true;
		}
		return false;
	}

	private expect(t: TK, msg: string): Token {
		if (this.peek() === t) return this.advance();
		const tok = this.cur();
		this.diags.push({
			severity: "error",
			message: msg,
			span: { start: tok.start, end: tok.end },
		});
		return tok;
	}

	private isNameToken(t: TK): boolean {
		return (
			t === TK.Ident ||
			t === TK.StrType ||
			t === TK.NumType ||
			t === TK.BoolType ||
			t === TK.ListType ||
			t === TK.MapType
		);
	}

	private expectName(msg: string): Token {
		if (this.isNameToken(this.peek())) return this.advance();
		return this.expect(TK.Ident, msg);
	}

	private err(msg: string): void {
		const tok = this.cur();
		this.diags.push({
			severity: "error",
			message: msg,
			span: { start: tok.start, end: tok.end },
		});
	}

	private nameIsCompilerReserved(name: string): boolean {
		return (
			name.startsWith("__estelle_") || RESERVED_INTERNAL_NAMES.has(name)
		);
	}

	private nameIsLanguageReserved(name: string): boolean {
		return RESERVED_USER_NAMES.has(name);
	}

	private nameDiag(tok: Token, msg: string): void {
		this.diags.push({
			severity: "error",
			message: msg,
			span: { start: tok.start, end: tok.end },
		});
	}

	parse(): ParseResult {
		const imports: ImportDecl[] = [];
		const fncs: FncDecl[] = [];

		while (this.peek() !== TK.Eof) {
			if (this.peek() === TK.Import) {
				imports.push(this.parseImport());
			} else if (this.peek() === TK.Fnc || this.peek() === TK.Pub) {
				fncs.push(this.parseFnc(true));
			} else {
				this.err(`Unexpected token "${this.cur().value}" at top level`);
				this.advance();
			}
		}

		if (this.diags.some((d) => d.severity === "error"))
			return { ok: false, diagnostics: this.diags };
		return { ok: true, program: { kind: "Program", imports, fncs } };
	}

	parseExpressionOnly(): ParseExprResult {
		const expr = this.parseExpr();
		if (this.peek() !== TK.Eof) {
			const tok = this.cur();
			this.diags.push({
				severity: "error",
				message: `Unexpected token "${tok.value}" after interpolation expression`,
				span: { start: tok.start, end: tok.end },
			});
		}
		if (this.diags.some((d) => d.severity === "error"))
			return { ok: false, diagnostics: this.diags };
		return { ok: true, expr };
	}

	private parseImport(): ImportDecl {
		this.advance();
		const pathTok = this.expect(
			TK.String,
			'Expected module path string after "import"',
		);
		const path = pathTok.value;
		let alias: string;
		let aliasTok: Token;
		if (this.eat(TK.As)) {
			aliasTok = this.expectName('Expected alias after "as"');
			alias = aliasTok.value;
		} else {
			alias = path.split(":").pop() ?? path;
			aliasTok = pathTok;
		}
		if (alias === "arg") {
			this.nameDiag(
				aliasTok,
				'Import alias "arg" is reserved by Estelle arg-lowering; use another alias.',
			);
		}
		if (this.nameIsCompilerReserved(alias)) {
			this.nameDiag(
				aliasTok,
				`Import alias "${alias}" is reserved for compiler internals.`,
			);
		}
		return { kind: "Import", path, alias };
	}

	private parseFnc(allowPubKeyword: boolean): FncDecl {
		let pub = false;
		if (this.peek() === TK.Pub) {
			this.advance();
			if (!allowPubKeyword)
				this.err(`"pub fnc" is not allowed inside another function`);
			else pub = true;
		}
		this.expect(TK.Fnc, 'Expected "fnc"');
		const nameTok = this.expectName("Expected function name");
		const name = nameTok.value;
		if (name !== "main" && isBuiltinCallName(name))
			this.nameDiag(
				nameTok,
				`Function name "${name}" conflicts with a built-in call name.`,
			);
		if (this.nameIsCompilerReserved(name))
			this.nameDiag(
				nameTok,
				`Function name "${name}" is reserved for compiler internals.`,
			);

		const params: Param[] = [];
		if (this.eat(TK.LParen)) {
			while (this.peek() !== TK.RParen && this.peek() !== TK.Eof) {
				const pnameTok = this.expectName("Expected parameter name");
				const pname = pnameTok.value;
				if (this.nameIsLanguageReserved(pname))
					this.nameDiag(
						pnameTok,
						`Parameter name "${pname}" is reserved by Estelle.`,
					);
				if (this.nameIsCompilerReserved(pname))
					this.nameDiag(
						pnameTok,
						`Parameter name "${pname}" is reserved for compiler internals.`,
					);
				const ptype = this.parseType();
				if (ptype === null) {
					this.err(`Expected type for parameter "${pname}"`);
				} else {
					params.push({
						name: pname,
						type: ptype.type,
						nullable: ptype.nullable,
					});
				}
				if (!this.eat(TK.Comma)) break;
			}
			this.expect(TK.RParen, 'Expected ")"');
		}

		const returnParsed = this.parseType();
		const returnType = returnParsed?.type ?? null;
		this.expect(TK.LBrace, 'Expected "{"');
		const body = this.parseBody();
		this.expect(TK.RBrace, 'Expected "}"');

		return { kind: "Fnc", pub, name, params, returnType, body };
	}

	private parseType(): { type: EstelleType; nullable: boolean } | null {
		let type: EstelleType | null = null;
		switch (this.peek()) {
			case TK.StrType:
				this.advance();
				type = "str";
				break;
			case TK.NumType:
				this.advance();
				type = "num";
				break;
			case TK.BoolType:
				this.advance();
				type = "bool";
				break;
			case TK.ListType:
				this.advance();
				type = "list";
				break;
			case TK.MapType:
				this.advance();
				type = "map";
				break;
			default:
				return null;
		}
		return { type, nullable: this.eat(TK.Question) };
	}

	private parseBody(): Stmt[] {
		const stmts: Stmt[] = [];
		while (this.peek() !== TK.RBrace && this.peek() !== TK.Eof) {
			const stmt = this.parseStmt();
			if (stmt) stmts.push(stmt);
		}
		return stmts;
	}

	private parseStmt(): Stmt | null {
		if (this.peek() === TK.Pub || this.peek() === TK.Fnc)
			return { kind: "NestFnc", fnc: this.parseFnc(false) };
		if (this.eat(TK.If)) return this.parseIf();
		if (this.eat(TK.Try)) return this.parseTry();
		if (this.eat(TK.Lua)) {
			const tok = this.expect(TK.LuaBlock, 'Expected "{" after "lua"');
			return { kind: "Lua", source: tok.value };
		}
		if (this.eat(TK.For)) return this.parseForIn();
		if (this.eat(TK.While)) return this.parseWhile();
		if (this.eat(TK.Repeat)) return this.parseRepeat();
		if (this.eat(TK.Break)) return { kind: "Break" };
		if (this.eat(TK.Continue)) return { kind: "Continue" };
		if (this.eat(TK.Output)) {
			if (this.peek() === TK.OutputBlock)
				return { kind: "OutputBlock", value: this.advance().value };
			return { kind: "Output", value: this.parseExpr() };
		}
		if (this.eat(TK.Return)) {
			if (this.peek() === TK.RBrace)
				return { kind: "Return", value: null };
			return { kind: "Return", value: this.parseExpr() };
		}

		if (this.isNameToken(this.peek())) {
			const tok = this.advance();
			const left = parsePostfixWithContext(this.exprContext(), {
				kind: "Ident",
				name: tok.value,
			});
			if (this.eat(TK.Eq)) {
				const value = this.parseExpr();
				const target = this.toAssignTarget(left);
				if (
					target?.kind === "Var" &&
					this.nameIsCompilerReserved(target.name)
				) {
					this.nameDiag(
						tok,
						`Variable name "${target.name}" is reserved for compiler internals.`,
					);
				}
				if (
					target?.kind === "Var" &&
					this.nameIsLanguageReserved(target.name)
				) {
					this.nameDiag(
						tok,
						`Variable name "${target.name}" is reserved by Estelle.`,
					);
				}
				if (!target) {
					this.diags.push({
						severity: "error",
						message: "Invalid assignment target",
						span: { start: tok.start, end: tok.end },
					});
					return null;
				}
				return { kind: "Assign", target, value };
			}
			if (this.eat(TK.PlusEq)) {
				const value = this.parseExpr();
				const target = this.toAssignTarget(left);
				if (!target) {
					this.diags.push({
						severity: "error",
						message: "Invalid assignment target",
						span: { start: tok.start, end: tok.end },
					});
					return null;
				}
				return { kind: "CompoundAssign", target, value };
			}
			return { kind: "ExprStmt", expr: left };
		}

		this.err(`Unexpected token "${this.cur().value}" in statement`);
		this.advance();
		return null;
	}

	private parseIf(): Stmt {
		const branches: { condition: Expr; body: Stmt[] }[] = [];
		const firstCond = this.parseExpr();
		this.expect(TK.LBrace, 'Expected "{" after if condition');
		const firstBody = this.parseBody();
		this.expect(TK.RBrace, 'Expected "}" after if body');
		branches.push({ condition: firstCond, body: firstBody });

		while (this.eat(TK.Else)) {
			if (this.eat(TK.If)) {
				const cond = this.parseExpr();
				this.expect(TK.LBrace, 'Expected "{" after else if condition');
				const body = this.parseBody();
				this.expect(TK.RBrace, 'Expected "}" after else if body');
				branches.push({ condition: cond, body });
				continue;
			}

			this.expect(TK.LBrace, 'Expected "{" after else');
			const elseBody = this.parseBody();
			this.expect(TK.RBrace, 'Expected "}" after else body');
			return { kind: "If", branches, elseBody };
		}

		return { kind: "If", branches, elseBody: null };
	}

	private parseTry(): Stmt {
		this.expect(TK.LBrace, 'Expected "{" after try');
		const tryBody = this.parseBody();
		this.expect(TK.RBrace, 'Expected "}" after try body');

		if (!this.eat(TK.Catch))
			return { kind: "Try", tryBody, catchVar: null, catchBody: null };

		let catchVar: string | null = null;
		if (this.isNameToken(this.peek())) catchVar = this.advance().value;
		this.expect(TK.LBrace, 'Expected "{" after catch');
		const catchBody = this.parseBody();
		this.expect(TK.RBrace, 'Expected "}" after catch body');
		return { kind: "Try", tryBody, catchVar, catchBody };
	}

	private parseForIn(): Stmt {
		const first = this.expectName(
			'Expected loop variable after "for"',
		).value;
		let indexName: string | null = null;
		let itemName = first;
		if (this.eat(TK.Comma)) {
			indexName = first;
			itemName = this.expectName(
				'Expected item variable after ","',
			).value;
		}
		this.expect(TK.In, 'Expected "in" in for loop');
		const iterable = this.parseExpr();
		this.expect(TK.LBrace, 'Expected "{" after for loop header');
		const body = this.parseBody();
		this.expect(TK.RBrace, 'Expected "}" after for loop body');
		if (!indexName && iterable.kind === "Binary" && iterable.op === "..") {
			return {
				kind: "ForRange",
				varName: itemName,
				start: iterable.left,
				end: iterable.right,
				body,
			};
		}
		return { kind: "ForIn", indexName, itemName, iterable, body };
	}

	private parseWhile(): Stmt {
		const condition = this.parseExpr();
		this.expect(TK.LBrace, 'Expected "{" after while condition');
		const body = this.parseBody();
		this.expect(TK.RBrace, 'Expected "}" after while body');
		return { kind: "While", condition, body };
	}

	private parseRepeat(): Stmt {
		const count = this.parseExpr();
		this.expect(TK.LBrace, 'Expected "{" after repeat count');
		const body = this.parseBody();
		this.expect(TK.RBrace, 'Expected "}" after repeat body');
		return { kind: "Repeat", count, body };
	}

	private parseExpr(): Expr {
		return parseExprWithContext(this.exprContext());
	}

	private exprContext(): ExprParseContext {
		return {
			cur: () => this.cur(),
			peek: () => this.peek(),
			advance: () => this.advance(),
			eat: (t) => this.eat(t),
			expect: (t, msg) => this.expect(t, msg),
			expectName: (msg) => this.expectName(msg),
			err: (msg) => this.err(msg),
			getPos: () => this.pos,
			setPos: (pos) => {
				this.pos = pos;
			},
			nameIsCompilerReserved: (name) => this.nameIsCompilerReserved(name),
			nameIsLanguageReserved: (name) => this.nameIsLanguageReserved(name),
			nameDiag: (tok, msg) => this.nameDiag(tok, msg),
		};
	}

	private toAssignTarget(expr: Expr): AssignTarget | null {
		if (expr.kind === "Ident") return { kind: "Var", name: expr.name };
		if (expr.kind === "Member")
			return {
				kind: "Member",
				object: expr.object,
				property: expr.property,
			};
		if (expr.kind === "Index")
			return { kind: "Index", object: expr.object, index: expr.index };
		return null;
	}
}

export function parse(tokens: readonly Token[]): ParseResult {
	return new Parser(tokens).parse();
}

export function parseExpression(tokens: readonly Token[]): ParseExprResult {
	return new Parser(tokens).parseExpressionOnly();
}
