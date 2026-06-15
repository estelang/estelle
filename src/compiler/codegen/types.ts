import type { EstelleType } from "../ast/index.ts";

export const IND_STEP = "    ";

export type ValueKind =
	| "str"
	| "num"
	| "bool"
	| "list"
	| "map"
	| "title"
	| "message"
	| "language"
	| "site"
	| "unknown";

export type RuntimeHelper =
	| "listConcat"
	| "has"
	| "padleft"
	| "padright"
	| "wikiBool"
	| "default";

export interface EmitCtx {
	invokeScoped: boolean;
	usesOutput: boolean;
	invokeEntries: ReadonlySet<string>;
	globalAliases: ReadonlyMap<string, string>;
	runtimeHelpers: Set<RuntimeHelper>;
	coerceTempId: number;
	loopDepth: number;
	loopBreakFlags: string[];
	locals: Set<string>;
	varKinds: Map<string, ValueKind>;
	lambdaBindings: Set<string>[];
	pageTemps: Map<string, string>;
	pendingLines: string[];
	indent: string;
}

export const INVOKE_OUTPUT_RETURN_EXPR =
	'(#_out == 0 and "" or (#_out == 1 and _out[1] or table.concat(_out, "\\n")))';

export function mapTypeToKind(t: EstelleType | null): ValueKind {
	if (t === null) return "unknown";
	return t;
}
