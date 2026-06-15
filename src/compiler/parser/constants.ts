export const BUILTIN_CALL_NAMES = new Set([
	"trim",
	"lower",
	"upper",
	"sub",
	"find",
	"replace",
	"split",
	"join",

	"floor",
	"ceil",
	"abs",
	"round",
	"tonum",
	"tostr",
	"len",
	"push",
	"pop",
	"has",
	"default",

	"page",
	"currentpage",
	"arg",
	"addWarning",
	"allToString",
	"clone",
	"getCurrentFrame",
	"incrementExpensiveFunctionCount",
	"isSubsting",
	"loadData",
	"loadJsonData",
	"dumpObject",
	"log",
	"logObject",
]);

export function isBuiltinCallName(name: string): boolean {
	return BUILTIN_CALL_NAMES.has(name);
}

export const RESERVED_INTERNAL_NAMES = new Set([
	"_arg",
	"_out",
	"_fargs",
	"_pargs",
	"output",
]);

export const RESERVED_USER_NAMES = new Set(["arg"]);
