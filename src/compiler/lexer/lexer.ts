import { findLuaBlockEnd, findOutputBlockEnd } from "./blockScanners.ts";
import { KEYWORDS, TK, type Token } from "./tokens.ts";
export function lex(src: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;
	const n = src.length;

	while (i < n) {
		const c = src[i];

		if (c === " " || c === "\t" || c === "\r" || c === "\n") {
			i++;
			continue;
		}

		if (c === "/" && src[i + 1] === "/") {
			while (i < n && src[i] !== "\n") i++;
			continue;
		}
		if (c === "/" && src[i + 1] === "*") {
			i += 2;
			while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
			i += 2;
			continue;
		}

		const start = i++;

		if (c === '"' || c === "'") {
			const q = c;
			let val = "";
			while (i < n && src[i] !== q) {
				if (src[i] === "\\") i++;
				val += src[i++];
			}
			i++;
			tokens.push({ type: TK.String, value: val, start, end: i });
			continue;
		}

		if (c >= "0" && c <= "9") {
			let val = c;
			while (
				i < n &&
				((src[i] >= "0" && src[i] <= "9") || src[i] === ".")
			)
				val += src[i++];
			tokens.push({ type: TK.Number, value: val, start, end: i });
			continue;
		}

		if ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_") {
			let val = c;
			while (
				i < n &&
				((src[i] >= "a" && src[i] <= "z") ||
					(src[i] >= "A" && src[i] <= "Z") ||
					(src[i] >= "0" && src[i] <= "9") ||
					src[i] === "_")
			)
				val += src[i++];
			const tt = KEYWORDS[val] ?? TK.Ident;
			tokens.push({ type: tt, value: val, start, end: i });
			if (tt === TK.Lua || tt === TK.Output) {
				let j = i;
				while (
					j < n &&
					(src[j] === " " ||
						src[j] === "\t" ||
						src[j] === "\r" ||
						src[j] === "\n")
				)
					j++;
				if (src[j] === "{") {
					const blockStart = j + 1;
					const blockEnd =
						tt === TK.Lua
							? findLuaBlockEnd(src, blockStart)
							: findOutputBlockEnd(src, blockStart);
					if (blockEnd === -1)
						throw new Error(
							tt === TK.Lua
								? "Unclosed lua block"
								: "Unclosed output block",
						);
					tokens.push({
						type: tt === TK.Lua ? TK.LuaBlock : TK.OutputBlock,
						value: src.slice(blockStart, blockEnd),
						start: blockStart,
						end: blockEnd,
					});
					i = blockEnd + 1;
				}
			}
			continue;
		}

		switch (c) {
			case "{":
				tokens.push({ type: TK.LBrace, value: c, start, end: i });
				break;
			case "}":
				tokens.push({ type: TK.RBrace, value: c, start, end: i });
				break;
			case "(":
				tokens.push({ type: TK.LParen, value: c, start, end: i });
				break;
			case ")":
				tokens.push({ type: TK.RParen, value: c, start, end: i });
				break;
			case "[":
				tokens.push({ type: TK.LBracket, value: c, start, end: i });
				break;
			case "]":
				tokens.push({ type: TK.RBracket, value: c, start, end: i });
				break;
			case ",":
				tokens.push({ type: TK.Comma, value: c, start, end: i });
				break;
			case "|":
				tokens.push({ type: TK.Pipe, value: c, start, end: i });
				break;
			case ":":
				tokens.push({ type: TK.Colon, value: c, start, end: i });
				break;
			case "%":
				tokens.push({ type: TK.Percent, value: c, start, end: i });
				break;
			case "+":
				tokens.push({ type: TK.Plus, value: c, start, end: i });
				break;
			case "-":
				tokens.push({ type: TK.Minus, value: c, start, end: i });
				break;
			case "*":
				tokens.push({ type: TK.Star, value: c, start, end: i });
				break;
			case "/":
				tokens.push({ type: TK.Slash, value: c, start, end: i });
				break;
			case ".":
				if (src[i] === ".") {
					tokens.push({
						type: TK.DotDot,
						value: "..",
						start,
						end: ++i,
					});
					break;
				}
				tokens.push({ type: TK.Dot, value: c, start, end: i });
				break;
			case "=":
				if (src[i] === "=") {
					tokens.push({
						type: TK.EqEq,
						value: "==",
						start,
						end: ++i,
					});
					break;
				}
				if (src[i] === ">") {
					tokens.push({
						type: TK.Arrow,
						value: "=>",
						start,
						end: ++i,
					});
					break;
				}
				tokens.push({ type: TK.Eq, value: c, start, end: i });
				break;
			case "!":
				if (src[i] === "=")
					tokens.push({
						type: TK.BangEq,
						value: "!=",
						start,
						end: ++i,
					});
				break;
			case "<":
				if (src[i] === "=") {
					tokens.push({
						type: TK.LtEq,
						value: "<=",
						start,
						end: ++i,
					});
					break;
				}
				tokens.push({ type: TK.Lt, value: c, start, end: i });
				break;
			case ">":
				if (src[i] === "=") {
					tokens.push({
						type: TK.GtEq,
						value: ">=",
						start,
						end: ++i,
					});
					break;
				}
				tokens.push({ type: TK.Gt, value: c, start, end: i });
				break;
		}
	}

	tokens.push({ type: TK.Eof, value: "", start: i, end: i });
	return tokens;
}
