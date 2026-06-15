import type { EmitCtx, RuntimeHelper } from "./types.ts";

const RUNTIME_HELPER_NAMES: Readonly<Record<RuntimeHelper, string>> = {
	listConcat: "__estelle_list_concat",
	has: "__estelle_has",
	padleft: "__estelle_padleft",
	padright: "__estelle_padright",
	wikiBool: "__estelle_bool",
	default: "__estelle_default",
};

export const RUNTIME_HELPER_ORDER: readonly RuntimeHelper[] = [
	"listConcat",
	"has",
	"padleft",
	"padright",
	"wikiBool",
	"default",
];

export const HOT_GLOBAL_BY_BUILTIN: Readonly<Record<string, string>> = {
	trim: "mw.text.trim",
	lower: "mw.ustring.lower",
	upper: "mw.ustring.upper",
	sub: "mw.ustring.sub",
	find: "mw.ustring.find",
	replace: "mw.ustring.gsub",
	split: "mw.text.split",
	join: "table.concat",
};

export const HOT_GLOBAL_ALIAS_ORDER = [
	"mw.text.trim",
	"mw.ustring.lower",
	"mw.ustring.upper",
	"mw.ustring.sub",
	"mw.ustring.find",
	"mw.ustring.gsub",
	"mw.text.split",
	"table.concat",
];

export function useRuntimeHelper(ctx: EmitCtx, helper: RuntimeHelper): string {
	ctx.runtimeHelpers.add(helper);
	return RUNTIME_HELPER_NAMES[helper];
}

export function emitGlobalCall(
	path: string,
	args: readonly string[],
	ctx: EmitCtx,
): string {
	const callee = ctx.globalAliases.get(path) ?? path;
	return `${callee}(${args.join(", ")})`;
}

export function emitGlobalAliasLines(
	aliases: ReadonlyMap<string, string>,
	indent: string,
): string[] {
	const lines: string[] = [];
	for (const path of HOT_GLOBAL_ALIAS_ORDER) {
		const alias = aliases.get(path);
		if (!alias) continue;
		lines.push(`${indent}local ${alias} = ${path}`);
	}
	return lines;
}

export function emitRuntimeHelper(helper: RuntimeHelper): string {
	switch (helper) {
		case "listConcat":
			return [
				"local function __estelle_list_concat(__a, __b)",
				"\tlocal __r = {}",
				"\tlocal __n = 0",
				"\tfor __i = 1, #__a do __n = __n + 1 __r[__n] = __a[__i] end",
				"\tfor __i = 1, #__b do __n = __n + 1 __r[__n] = __b[__i] end",
				"\treturn __r",
				"end",
			].join("\n");
		case "has":
			return [
				"local function __estelle_has(__l, __v)",
				"\tfor __i = 1, #__l do",
				"\t\tif __l[__i] == __v then return true end",
				"\tend",
				"\treturn false",
				"end",
			].join("\n");
		case "padleft":
			return [
				"local function __estelle_padleft(__s, __n, __c)",
				"\tlocal __ulen = mw.ustring.len",
				"\tlocal __rep = string.rep",
				"\t__s = tostring(__s)",
				"\t__n = tonumber(__n) or 0",
				'\t__c = tostring(__c or "0")',
				'\tif __c == "" then __c = "0" end',
				"\tlocal __need = __n - __ulen(__s)",
				"\tif __need <= 0 then return __s end",
				"\treturn __rep(__c, __need) .. __s",
				"end",
			].join("\n");
		case "padright":
			return [
				"local function __estelle_padright(__s, __n, __c)",
				"\tlocal __ulen = mw.ustring.len",
				"\tlocal __rep = string.rep",
				"\t__s = tostring(__s)",
				"\t__n = tonumber(__n) or 0",
				'\t__c = tostring(__c or "0")',
				'\tif __c == "" then __c = "0" end',
				"\tlocal __need = __n - __ulen(__s)",
				"\tif __need <= 0 then return __s end",
				"\treturn __s .. __rep(__c, __need)",
				"end",
			].join("\n");
		case "wikiBool":
			return [
				"local function __estelle_bool(v)",
				'\tif type(v) == "boolean" then return v end',
				"\tif v == nil then return false end",
				"\tlocal s = mw.ustring.lower(mw.text.trim(tostring(v)))",
				'\treturn s == "true" or s == "1" or s == "yes" or s == "y" or s == "on"',
				"end",
			].join("\n");
		case "default":
			return [
				"local function __estelle_default(v, d)",
				'\tif v == nil or v == "" then return d end',
				"\treturn v",
				"end",
			].join("\n");
	}
}
