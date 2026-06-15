import type { CompileResult } from "./diagnostics.ts";
import { lex } from "./lexer/index.ts";
import { parse } from "./parser/index.ts";
import { emitLua } from "./codegen/index.ts";
import { optimize } from "./optimizer/index.ts";
import luamin from "luamin";

export interface TranspileOptions {
	readonly optimize?: boolean;
	readonly embed?: boolean;
	readonly minify?: boolean;
}

export function transpile(
	source: string,
	options?: TranspileOptions,
): CompileResult {
	const parsed = parse(lex(source));
	if (!parsed.ok) return { lua: null, diagnostics: parsed.diagnostics };
	const runOptimize = options?.optimize ?? false;
	try {
		const program = runOptimize ? optimize(parsed.program) : parsed.program;
		let lua = emitLua(program);
		if (options?.minify) {
			try {
				lua = luamin.minify(lua);
			} catch (error) {
				return {
					lua: null,
					diagnostics: [
						{
							severity: "error",
							message:
								error instanceof Error
									? `Minify failed: ${error.message}`
									: `Minify failed: ${String(error)}`,
						},
					],
				};
			}
		}
		const outLua = options?.embed
			? `--[[ESTESTART\n${source}\nESTEEND]]\n${lua}`
			: lua;
		return { lua: outLua, diagnostics: [] };
	} catch (error) {
		return {
			lua: null,
			diagnostics: [
				{
					severity: "error",
					message:
						error instanceof Error ? error.message : String(error),
				},
			],
		};
	}
}
