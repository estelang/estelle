import { test, expect, describe } from "bun:test";
import { transpile } from "./index.ts";

function compile(src: string): string {
	const r = transpile(src, { optimize: true });
	if (!r.lua)
		throw new Error("compile failed: " + JSON.stringify(r.diagnostics));
	return r.lua;
}

describe("module boilerplate", () => {
	test("wraps main with frame, _arg helper, and concat tail", () => {
		const lua = compile(`fnc main { x = arg("k") output { \${x} } }`);
		expect(lua).toContain("local p = {}");
		expect(lua).toContain("main = function(frame)");
		expect(lua).toContain("p.main = main");
		expect(lua).toContain("local _fargs = frame.args");
		expect(lua).toContain("local _parent = frame:getParent()");
		expect(lua).toContain(
			"local _pargs = (_parent and _parent.args) or {}",
		);
		expect(lua).toContain('table.concat(_out, "\\n")');
		expect(lua).toContain("return p");
	});

	test("no arg() omits _arg prelude", () => {
		const lua = compile(`fnc main { output { Hi } }`);
		expect(lua).not.toContain("_fargs");
		expect(lua).not.toContain("_pargs");
		expect(lua).not.toContain("_arg");
	});

	test("no output omits _out and returns empty string", () => {
		const lua = compile(`fnc main { x = "hello" }`);
		expect(lua).not.toContain("_out");
		expect(lua).not.toContain("output(");
		expect(lua).toContain('return ""');
	});

	test("pub fnc gets invoke prelude", () => {
		const lua = compile(`pub fnc render { output { x } }`);
		expect(lua).toContain("render = function(frame)");
		expect(lua).toContain("p.render = render");
	});

	test("non-pub fnc emits local function", () => {
		const lua = compile(
			`fnc helper(x str) str { return x } fnc main { output { \${helper("a")} } }`,
		);
		expect(lua).toContain("local function helper(x)");
		expect(lua).toContain("main = function(frame)");
		expect(lua).toContain("p.main = main");
	});
});

describe("invoke entry calls", () => {
	test("main calls pub fnc by passing frame", () => {
		const lua = compile(
			`pub fnc render { output { hi } }\nfnc main { render() }`,
		);
		expect(lua).toContain("local render, main");
		expect(lua).toContain("render(frame)");
	});
});

describe("nested fnc", () => {
	test("emits local function and closes over outer locals", () => {
		const lua = compile(`fnc main {
			n = 1
			fnc inner() str {
				return n
			}
			output { \${inner()} }
		}`);
		expect(lua).toContain("local function inner()");
		expect(lua).toContain("return n");
		expect(lua).toContain("inner()");
	});
	test("nested inside private top-level fnc", () => {
		const lua = compile(`fnc outer() str {
			fnc g() str { return "x" }
			return g()
		}
		fnc main { output { \${outer()} } }`);
		expect(lua).toContain("local function outer()");
		expect(lua).toContain("local function g()");
	});
	test("pub fnc inside body is rejected", () => {
		const r = transpile(`fnc main { pub fnc x { output "a" } }`);
		expect(r.lua).toBeNull();
		expect(
			r.diagnostics.some((d) =>
				/not allowed inside another function/i.test(d.message),
			),
		).toBe(true);
	});
});

describe("method calls (:)", () => {
	test("lowers paren and brace-table forms", () => {
		const lua = compile(`pub fnc main {
			x = frame:expandTemplate({ title: "Skin", args: { name: "A" } })
			y = t:foo(1, 2)
			return x
		}`);
		expect(lua).toContain("frame:expandTemplate({");
		expect(lua).toContain('name = "A"');
		expect(lua).toContain("t:foo(1, 2)");
	});
	test("parenthesizes literal receiver for valid Lua", () => {
		const lua = compile(`fnc main { return "ab":sub(1, 1) }`);
		expect(lua).toMatch(/\("ab"\):sub\(1, 1\)/);
	});
});

describe("Lua stdlib (Scribunto)", () => {
	test("qualified math / os / string calls emit verbatim", () => {
		const lua = compile(`fnc main {
			a = math.random(1, 10)
			b = math.randomseed(123)
			c = os.clock()
			d = string.format("%s", x)
			output { \${d} }
		}`);
		expect(lua).toContain("math.random(1, 10)");
		expect(lua).toContain("math.randomseed(123)");
		expect(lua).toContain("os.clock()");
		expect(lua).toContain('string.format("%s", x)');
	});
	test("bare global tonumber passes through", () => {
		const lua = compile(`fnc main { n = tonumber("7") output { \${n} } }`);
		expect(lua).toContain('tonumber("7")');
	});
});

describe("thin lambdas", () => {
	test("two-param lowers to comparator-shaped Lua function", () => {
		const lua = compile(`fnc main {
			table.sort(rows, (a, b) => a.x < b.x)
			output { \${1} }
		}`);
		expect(lua).toContain("function(a, b)");
		expect(lua).toContain("table.sort(rows, ");
		expect(lua).toContain("return");
		expect(lua).toContain("a.x");
		expect(lua).toContain("b.x");
	});
	test("zero-arg lambda", () => {
		const lua = compile(`fnc main {
			thunk = () => 1 + 2
			output { \${thunk} }
		}`);
		expect(lua).toContain("function() return 3 end");
	});
	test("parenthesized non-lambda arithmetic can fold to constant", () => {
		const lua = compile(`fnc main {
			n = (1 + 2) * 3
			output { \${n} }
		}`);
		expect(lua).toContain("local n = 9");
	});
	test("pipe in lambda body lowers through expression pipeline", () => {
		const lua = compile(`fnc main {
			g = (s) => s | lower
			output { ok }
		}`);
		expect(lua).toContain("function(s)");
		expect(lua).toContain("mw.ustring.lower(");
	});
	test("duplicate lambda parameters are rejected", () => {
		const r = transpile(`fnc main { x = (a, a) => 1 output { z } }`);
		expect(r.lua).toBeNull();
		expect(
			r.diagnostics.some((d) =>
				/Duplicate lambda parameter/i.test(d.message),
			),
		).toBe(true);
	});
	test("len on thin lambda parameter is ambiguous (compile error)", () => {
		const r = transpile(`fnc main {
			xs = [{ x: 1 }]
			g = (row) => len(row)
			output { ok }
		}`);
		expect(r.lua).toBeNull();
		expect(
			r.diagnostics.some((d) =>
				/len\(\.\.\.\) is ambiguous/i.test(d.message),
			),
		).toBe(true);
	});
	test("len resolves outer binding when lambda param name differs", () => {
		const lua = compile(`fnc main {
			items = [{ x: 1 }]
			g = (row) => len(items)
			output { ok }
		}`);
		expect(lua).toContain("#items");
	});
});

describe("imports", () => {
	test("default alias from path", () => {
		const lua = compile(
			`import "Module:StringUtils" fnc main { output { x } }`,
		);
		expect(lua).toContain(
			'local StringUtils = require("Module:StringUtils")',
		);
	});

	test("explicit as alias", () => {
		const lua = compile(
			`import "Module:StringUtils" as str fnc main { output { \${str.clean("a")} } }`,
		);
		expect(lua).toContain('local str = require("Module:StringUtils")');
		expect(lua).toContain("str.clean(");
	});
});

describe("variables and coercions", () => {
	test("simple assignment uses local once, reassign without local", () => {
		const lua = compile(`fnc main { n = 1 n = n + 2 output { \${n} } }`);
		expect(lua).toContain("local n = 1");
		expect(lua).toContain("n = n + 2");
		expect(lua).not.toContain("local n = (n + 2)");
	});

	test("as num emits tonumber", () => {
		const lua = compile(
			`fnc main { c = arg("c", 1) as num output { \${c} } }`,
		);
		expect(lua).toContain("local c = tonumber(_arg(");
	});

	test("as bool uses wiki truthy helper", () => {
		const lua = compile(
			`fnc main { f = arg("f", "yes") as bool output { \${f} } }`,
		);
		expect(lua).toContain("__estelle_bool");
		expect(lua).toContain('local f = __estelle_bool(_arg("f", "yes"))');
	});

	test("as bool in if condition", () => {
		const lua = compile(
			`fnc main { if arg("f", "y") as bool { output { on } } }`,
		);
		expect(lua).toContain("if __estelle_bool(_arg(");
	});
});

describe("output and interpolation", () => {
	test("plain literal", () => {
		const lua = compile(`fnc main { output { Hello! } }`);
		expect(lua).toContain('_out[#_out + 1] = "Hello!"');
	});

	test("quoted string output matches return-string ${} rules", () => {
		const lua = compile(
			`fnc main { name = arg("name", "x") output "Hi, \${name}!" }`,
		);
		expect(lua).toContain(
			'_out[#_out + 1] = "Hi, " .. tostring(name) .. "!"',
		);
	});

	test("ident interpolation", () => {
		const lua = compile(
			`fnc main { name = arg("name", "x") output { Hi, \${name}! } }`,
		);
		expect(lua).toContain(
			'_out[#_out + 1] = "Hi, " .. tostring(name) .. "!"',
		);
	});

	test("expression interpolation supports calls and math", () => {
		const lua = compile(
			`fnc main { output { Count: \${len(split('a,b', ',')) + 1} } }`,
		);
		expect(lua).toContain(
			'_out[#_out + 1] = "Count: " .. tostring(#mw.text.split("a,b", ",") + 1)',
		);
	});

	test("interpolation accepts single-quoted strings in inner expression", () => {
		const lua = compile(
			`fnc main { output { Page: \${page('Foo').text} } }`,
		);
		expect(lua).toContain('local __estelle_title_1 = mw.title.new("Foo")');
		expect(lua).toContain(
			'_out[#_out + 1] = "Page: " .. tostring(__estelle_title_1.text)',
		);
	});

	test("output block emits one output call per line", () => {
		const lua = compile(`fnc main {
title = arg("title", "Doc")
output {
== \${title} ==

[[\${title}|link]]
}
}`);
		expect(lua).toContain(
			'_out[#_out + 1] = "== " .. tostring(title) .. " =="',
		);
		expect(lua).toContain('_out[#_out + 1] = ""');
		expect(lua).toContain(
			'_out[#_out + 1] = "[[" .. tostring(title) .. "|link]]"',
		);
	});

	test("output block dedents common indent but preserves relative spacing", () => {
		const lua = compile(`fnc main {
output {
\tTabbed
  Spaced
}
}`);
		expect(lua).toContain('_out[#_out + 1] = "Tabbed"');
		expect(lua).toContain('_out[#_out + 1] = "  Spaced"');
	});

	test("output block removes common code indent", () => {
		const lua = compile(`fnc main {
    if true {
        output {
                [[X]]<br>
                {{DEFAULTSORT:X}}
        }
    }
}`);
		expect(lua).toContain('_out[#_out + 1] = "[[X]]<br>"');
		expect(lua).toContain('_out[#_out + 1] = "{{DEFAULTSORT:X}}"');
	});

	test("{{ in output block is literal wikitext double-brace", () => {
		const lua = compile(
			`fnc main { name = arg("name", "X") output { {{DEFAULTSORT:\${name}}} } }`,
		);
		expect(lua).toContain(
			'_out[#_out + 1] = "{{DEFAULTSORT:" .. tostring(name) .. "}}"',
		);
	});

	test("{| wikitext table syntax passes through literally in output block", () => {
		const lua = compile(`fnc main {
output {
{| class="wikitable"
|-
}
}`);
		expect(lua).toContain('_out[#_out + 1] = "{| class=\\\"wikitable\\\""');
		expect(lua).toContain('_out[#_out + 1] = "|-"');
	});
});

describe("arg lowering", () => {
	test("arg() inside main uses _arg", () => {
		const lua = compile(`fnc main { x = arg("k", "d") output { \${x} } }`);
		expect(lua).toContain('local x = _arg("k", "d")');
	});

	test("arg() inside non-pub fnc stays as arg", () => {
		const lua = compile(
			`fnc helper(s str) str { return s } fnc main { output { \${helper(arg("k"))} } }`,
		);
		expect(lua).toContain('helper(_arg("k"))');
	});
});

describe("control flow", () => {
	test("if / else if / else with ~= and operators", () => {
		const lua = compile(`fnc main {
			n = arg("n", 0) as num
			if n == 0 { output { zero } } else if n != 1 and n > 0 { output { pos } } else { output { neg } }
		}`);
		expect(lua).toContain("if n == 0 then");
		expect(lua).toContain("elseif n ~= 1 and n > 0 then");
		expect(lua).toContain("else");
	});

	test("not lowering", () => {
		const lua = compile(
			`fnc main { f = arg("f", "1") as bool if not f { output { off } } }`,
		);
		expect(lua).toContain("if (not f) then");
	});
});

describe("loops", () => {
	test("for in with index", () => {
		const lua = compile(
			`fnc main { items = arg("x") for i, item in items { output { \${item} } } }`,
		);
		expect(lua).toContain("for i = 1, #items do");
	});

	test("for key, value in map lowers to pairs", () => {
		const lua = compile(
			`fnc main { m = {name: "Alice", role: "Admin"} for k, v in m { output { \${k}: \${v} } } }`,
		);
		expect(lua).toContain("for k, v in pairs(m) do");
	});

	test("for in without index", () => {
		const lua = compile(
			`fnc main { items = arg("x") for item in items { output { \${item} } } }`,
		);
		expect(lua).toContain("for __i");
	});

	test("for range", () => {
		const lua = compile(`fnc main { for i in 1..3 { output { \${i} } } }`);
		expect(lua).toContain("for i = 1, 3 do");
	});

	test("while", () => {
		const lua = compile(
			`fnc main { i = 0 while i < 3 { i = i + 1 } output { \${i} } }`,
		);
		expect(lua).toContain("while i < 3 do");
	});

	test("repeat n compiles to numeric for", () => {
		const lua = compile(`fnc main { repeat 3 { output { x } } }`);
		const matches = lua.match(/_out\[#_out \+ 1\] = "x"/g) ?? [];
		expect(matches.length).toBe(3);
	});

	test("continue lowers to repeat...until true", () => {
		const lua = compile(
			`fnc main { for x in arg("xs") { if x == "skip" { continue } output { \${x} } } }`,
		);
		expect(lua).toContain("repeat");
		expect(lua).toContain("until true");
		expect(lua).toContain("break");
	});

	test("mixing break and continue in same body lowers", () => {
		const lua = compile(
			`fnc main { for x in arg("xs") { if x == "skip" { continue } if x == "stop" { break } output { ok } } }`,
		);
		expect(lua).toContain("local __estelle_loop_break_");
		expect(lua).toContain("repeat");
		expect(lua).toContain("until true");
		expect(lua).toContain("if __estelle_loop_break_");
	});
});

describe("tables", () => {
	test("list literal and indexing", () => {
		const lua = compile(
			`fnc main { fruits = ["a", "b"] output { \${fruits[1]} } }`,
		);
		expect(lua).toContain('local fruits = {"a", "b"}');
		expect(lua).toContain("fruits[1]");
	});

	test("map literal, member access, member assign", () => {
		const lua = compile(
			`fnc main { p = {name: "A", age: 1} p.score = 42 output { \${p.name} } }`,
		);
		expect(lua).toContain('local p = {name = "A", age = 1}');
		expect(lua).toContain("p.score = 42");
		expect(lua).toContain("tostring(p.name)");
	});
});

describe("string concat operator", () => {
	test(".. can fold string literals", () => {
		const lua = compile(
			`fnc main { s = "Hello" .. " World" output { \${s} } }`,
		);
		expect(lua).toContain('local s = "Hello World"');
	});
});

describe("list concat", () => {
	test("list + list uses shared concat helper", () => {
		const lua = compile(
			`fnc main { a = ["x"] b = ["y"] c = a + b output { \${c[1]} } }`,
		);
		expect(lua).toContain("local function __estelle_list_concat(__a, __b)");
		expect(lua).toContain("__estelle_list_concat(a, b)");
		expect(lua).toContain("for __i = 1, #__a do");
		expect(lua).toContain("for __i = 1, #__b do");
		expect(lua).not.toContain("(function(__a,__b)");
	});
});

describe("pipes", () => {
	test("simple chain", () => {
		const lua = compile(
			`fnc main { x = arg("v", "  Ada  ") | trim output { \${x} } }`,
		);
		expect(lua).toContain("local x = mw.text.trim(_arg");
	});

	test("call with extra args via parens", () => {
		const lua = compile(
			`fnc main { parts = arg("v") | split(",") output { \${parts[1]} } }`,
		);
		expect(lua).toContain('mw.text.split(_arg("v"), ",")');
	});

	test("pipe wraps multi-return replace before next call", () => {
		const lua = compile(
			`fnc main { x = "abc" | replace("a", "z") | trim output { \${x} } }`,
		);
		expect(lua).toContain(
			'mw.text.trim((mw.ustring.gsub("abc", "a", "z")))',
		);
	});
});

describe("builtins", () => {
	test("string builtins lower to mw helpers", () => {
		const lua = compile(
			`fnc main { t = trim(" x ") l = lower("Ab") u = upper("ab") s = sub("abc", 1, 2) output { \${t} } output { \${l} } output { \${u} } output { \${s} } }`,
		);
		expect(lua).toContain('local t = "x"');
		expect(lua).toContain('local l = "ab"');
		expect(lua).toContain('local u = "AB"');
		expect(lua).toContain("mw.ustring.sub");
	});

	test("number builtins lower to math/tonumber", () => {
		const lua = compile(
			`fnc main { r = round(x) f = floor(y) c = ceil(z) a = abs(w) n = tonum("7") output { \${r} } output { \${f} } output { \${c} } output { \${a} } output { \${n} } }`,
		);
		expect(lua).toContain("math.floor((x) + 0.5)");
		expect(lua).toContain("math.floor(y)");
		expect(lua).toContain("math.ceil(z)");
		expect(lua).toContain("math.abs(w)");
		expect(lua).toContain("local n = 7");
	});

	test("page/currentpage builtins lower correctly", () => {
		const lua = compile(
			`fnc main { p = page("Foo") cp = currentpage() output { \${p.text} } output { \${p.content} } output { \${cp.text} } }`,
		);
		expect(lua).toContain('local __estelle_title_1 = mw.title.new("Foo")');
		expect(lua).toContain("p = __estelle_title_1");
		expect(lua).toContain("tostring(p:getContent())");
		expect(lua).toContain("mw.title.getCurrentTitle()");
	});

	test("padding builtins lower", () => {
		const lua = compile(
			`fnc main { l = padleft("7", 3, "0") r = padright("a", 3, ".") output { \${l} } output { \${r} } }`,
		);
		expect(lua).toContain(
			"local function __estelle_padleft(__s, __n, __c)",
		);
		expect(lua).toContain(
			"local function __estelle_padright(__s, __n, __c)",
		);
		expect(lua).toContain("local __ulen = mw.ustring.len");
		expect(lua).toContain("local __rep = string.rep");
		expect(lua).toContain("return __rep(__c, __need) .. __s");
		expect(lua).toContain("return __s .. __rep(__c, __need)");
	});

	test("has builtin reuses shared helper", () => {
		const lua = compile(
			`fnc main { xs = ["a", "b"] a = has(xs, "a") b = has(xs, "z") output { \${a} } output { \${b} } }`,
		);
		const defs =
			lua.match(/local function __estelle_has\(__l, __v\)/g) ?? [];
		expect(defs.length).toBe(1);
		const calls = lua.match(/__estelle_has\(xs, /g) ?? [];
		expect(calls.length).toBe(2);
	});

	test("push statement lowers to direct append", () => {
		const lua = compile(
			`fnc main { xs = ["a"] push(xs, "b") output { \${xs[2]} } }`,
		);
		expect(lua).toContain('xs[#xs + 1] = "b"');
		expect(lua).not.toContain("table.insert(xs, ");
	});

	test("page(expr) reuses one hoisted title temp", () => {
		const lua = compile(
			`fnc main { output { \${page("Foo").exists} } output { \${page("Foo").id} } output { \${page("Foo").content} } }`,
		);
		const matches =
			lua.match(/local __estelle_title_1 = mw\.title\.new\("Foo"\)/g) ??
			[];
		expect(matches.length).toBe(1);
		expect(lua).toContain("tostring(__estelle_title_1.exists)");
		expect(lua).toContain("tostring(__estelle_title_1.id)");
		expect(lua).toContain("tostring(__estelle_title_1:getContent())");
	});

	test("len list vs string lowering", () => {
		const lua = compile(
			`fnc main { xs = split("a,b", ",") n1 = len(xs) n2 = len("abc") output { \${n1} } output { \${n2} } }`,
		);
		expect(lua).toContain("local n1 = #xs");
		expect(lua).toContain("local n2 = 3");
	});

	test("len ambiguous emits compile diagnostic", () => {
		const r = transpile(
			`fnc main { payload = page("Foo") n = len(payload) output { \${n} } }`,
		);
		expect(r.lua).toBeNull();
		expect(
			r.diagnostics.some((d) =>
				/len\(\.\.\.\) is ambiguous/.test(d.message),
			),
		).toBe(true);
	});

	test("mw-less dot notation lowers to Scribunto paths", () => {
		const lua = compile(`fnc main {
			addWarning("Heads up")
			s = text.trim(" x ")
			parts = text.split("a,b", ",")
			h = hash.hashValue("md5", "x")
			qs = uri.buildQueryString({ q: "x" })
			u = uri.new("https://example.org/wiki/Main_Page")
			ok = uri.validate(u)
			u:parse("/wiki/Test")
			uc = u:clone()
			u:extend({ action: "history" })
			t = title.new("Foo")
			cp = title.getCurrentTitle()
			div = html.create("div")
			svgObj = svg.new()
			svgObj:setAttribute("width", "10")
			output { \${s} \${parts[1]} \${h} \${qs} \${t.content} \${cp.content} \${tostr(ok)} \${tostr(uc)} \${tostr(div)} \${tostr(svgObj)} }
		}`);
		expect(lua).toContain('mw.addWarning("Heads up")');
		expect(lua).toContain('mw.text.trim(" x ")');
		expect(lua).toContain('mw.text.split("a,b", ",")');
		expect(lua).toContain('mw.hash.hashValue("md5", "x")');
		expect(lua).toContain('mw.uri.buildQueryString({q = "x"})');
		expect(lua).toContain(
			'mw.uri.new("https://example.org/wiki/Main_Page")',
		);
		expect(lua).toContain("mw.uri.validate(u)");
		expect(lua).toContain('u:parse("/wiki/Test")');
		expect(lua).toContain("u:clone()");
		expect(lua).toContain('u:extend({action = "history"})');
		expect(lua).toContain('mw.title.new("Foo")');
		expect(lua).toContain("mw.title.getCurrentTitle()");
		expect(lua).toContain('mw.html.create("div")');
		expect(lua).toContain("mw.svg.new()");
		expect(lua).toContain('svgObj:setAttribute("width", "10")');
		expect(lua).toContain("t:getContent()");
		expect(lua).toContain("cp:getContent()");
	});

	test("ustring namespace maps directly", () => {
		const lua = compile(`fnc main {
			s = ustring.lower("Ab")
			u = ustring.upper("ab")
			n = ustring.len("abc")
			p = ustring.sub("abcd", 2, 3)
			ok = ustring.isutf8("x")
			f = ustring.format("%s", "ok")
			cp = ustring.codepoint("A")
			m = ustring.match("abc", "b")
			r = ustring.rep("x", 3)
			nfc = ustring.toNFC("a")
			output { \${s} \${u} \${n} \${p} \${ok} \${f} \${cp} \${m} \${r} \${nfc} }
		}`);
		expect(lua).toContain('mw.ustring.lower("Ab")');
		expect(lua).toContain('mw.ustring.upper("ab")');
		expect(lua).toContain('mw.ustring.len("abc")');
		expect(lua).toContain('mw.ustring.sub("abcd", 2, 3)');
		expect(lua).toContain('mw.ustring.isutf8("x")');
		expect(lua).toContain('mw.ustring.format("%s", "ok")');
		expect(lua).toContain('mw.ustring.codepoint("A")');
		expect(lua).toContain('mw.ustring.match("abc", "b")');
		expect(lua).toContain('mw.ustring.rep("x", 3)');
		expect(lua).toContain('mw.ustring.toNFC("a")');
	});
});

describe("try / catch", () => {
	test("with catch var", () => {
		const lua = compile(
			`fnc main { try { output { ok } } catch err { output { \${err} } } }`,
		);
		expect(lua).toMatch(
			/local __estelle_try_ok_\d+, __estelle_try_err_\d+ = pcall\(function\(\)/,
		);
		expect(lua).toMatch(/local err = __estelle_try_err_\d+/);
		expect(lua).toMatch(/if not __estelle_try_ok_\d+ then/);
	});

	test("without catch rethrows", () => {
		const lua = compile(`fnc main { try { output { ok } } }`);
		expect(lua).toMatch(
			/if not __estelle_try_ok_\d+ then error\(__estelle_try_err_\d+\) end/,
		);
	});
});

describe("lua escape hatch", () => {
	test("emits raw lua wrapped in do/end", () => {
		const lua = compile(`fnc main { lua { local t = "x" } output { ok } }`);
		expect(lua).toContain("do");
		expect(lua).toContain('local t = "x"');
		expect(lua).toContain("end");
	});

	test("hoists non-local assignments as outer locals", () => {
		const lua = compile(`fnc main {
			lua {
				local t = mw.title.new("X")
				exists = t.exists
				pageId = t.id
			}
			output { \${exists} }
		}`);
		expect(lua).toMatch(/local exists\s*\n/);
		expect(lua).toMatch(/local pageId\s*\n/);
		expect(lua).toContain("exists = t.exists");
		expect(lua).toContain("pageId = t.id");
	});

	test("does not hoist if name already a local", () => {
		const lua = compile(`fnc main {
			n = 0
			lua { n = 1 }
			output { \${n} }
		}`);
		const matches = lua.match(/local n\b/g) ?? [];
		expect(matches.length).toBe(1);
	});
});

describe("error reporting", () => {
	test("non-call expression statements are accepted", () => {
		const lua = compile(
			`fnc main { x = {name: "A"} x.name output { done } }`,
		);
		expect(lua).toContain("do local _ = x.name end");
	});

	test("missing param type", () => {
		const r = transpile(
			`fnc add(a, b) num { return a + b } fnc main { output { \${add(1, 2)} } }`,
		);
		expect(
			r.diagnostics.some((d) => /type for parameter/.test(d.message)),
		).toBe(true);
	});

	test("missing closing brace flagged", () => {
		const r = transpile(`fnc main { output { x }`);
		expect(r.lua).toBeNull();
		expect(r.diagnostics.length).toBeGreaterThan(0);
	});

	test("import alias arg is rejected", () => {
		const r = transpile(
			`import "Module:Arguments" as arg fnc main { output { x } }`,
		);
		expect(r.lua).toBeNull();
		expect(
			r.diagnostics.some((d) =>
				/alias "arg" is reserved/i.test(d.message),
			),
		).toBe(true);
	});

	test("function name colliding with builtin is rejected", () => {
		const r = transpile(
			`fnc trim(s str) str { return s } fnc main { output { x } }`,
		);
		expect(r.lua).toBeNull();
		expect(
			r.diagnostics.some((d) =>
				/conflicts with a built-in/i.test(d.message),
			),
		).toBe(true);
	});

	test("function name colliding with explicit Scribunto mapping is rejected", () => {
		const r = transpile(
			`fnc addWarning(s str) str { return s } fnc main { output { x } }`,
		);
		expect(r.lua).toBeNull();
		expect(
			r.diagnostics.some((d) =>
				/conflicts with a built-in/i.test(d.message),
			),
		).toBe(true);
	});

	test("compiler internal variable names are rejected", () => {
		const r = transpile(`fnc main { _out = "x" output { \${_out} } }`);
		expect(r.lua).toBeNull();
		expect(
			r.diagnostics.some((d) =>
				/reserved for compiler internals/i.test(d.message),
			),
		).toBe(true);
	});

	test("arg cannot be used as variable or parameter name", () => {
		const r1 = transpile(`fnc main { arg = "x" output { \${arg} } }`);
		expect(r1.lua).toBeNull();
		expect(
			r1.diagnostics.some((d) => /reserved by estelle/i.test(d.message)),
		).toBe(true);
		const r2 = transpile(
			`fnc x(arg str) str { return arg } fnc main { output { x } }`,
		);
		expect(r2.lua).toBeNull();
		expect(
			r2.diagnostics.some((d) => /reserved by estelle/i.test(d.message)),
		).toBe(true);
	});

	test("continue outside loop emits compile diagnostic", () => {
		const r = transpile(`fnc main { continue }`);
		expect(r.lua).toBeNull();
		expect(
			r.diagnostics.some((d) =>
				/continue.*outside loop/i.test(d.message),
			),
		).toBe(true);
	});
});

describe("spec examples", () => {
	test("example 1 - simple greeting", () => {
		const lua = compile(`
fnc main {
    name = arg("name", "World")
    output "Hello, \${name}!"
}`);
		expect(lua).toContain(
			'_out[#_out + 1] = "Hello, " .. tostring(name) .. "!"',
		);
		expect(lua).toContain('table.concat(_out, "\\n")');
	});

	test("example 2 - list formatter", () => {
		const lua = compile(`
fnc main {
    raw   = arg("items", "")
    style = arg("style", "bullet")
    if raw == "" {
        output "No items provided."
        return
    }
    items = raw | split(",")
    if style == "bullet" {
        for item in items {
            clean = item | trim
            if clean == "" { continue }
            output "* \${clean}"
        }
    } else {
        for i, item in items {
            clean = item | trim
            if clean == "" { continue }
            output "\${i}. \${clean}"
        }
    }
}`);
		expect(lua).toContain('_out[#_out + 1] = "No items provided."');
		expect(lua).toContain("mw.text.split");
		expect(lua).toContain('if clean == "" then');
		expect(lua).toContain('_out[#_out + 1] = "* " .. tostring(clean)');
	});

	test("example 3 - page existence check with error handling", () => {
		const lua = compile(`
fnc main {
    name = arg("page")
    if name == nil {
        output "No page specified."
        return
    }
    try {
        lua {
            local t = mw.title.new(name)
            exists = t.exists
            pageid = t.id
        }
        if exists {
            output {
                [[\${name}]] exists (ID: \${pageid}).<br>
                {{DEFAULTSORT:\${name}}}
            }
        } else {
            output "[[\${name}]] does not exist."
        }
    } catch err {
        output "Error checking page: \${err}"
    }
}`);
		expect(lua).toContain("pcall");
		expect(lua).toContain("mw.title.new(name)");
		expect(lua).toContain("DEFAULTSORT:");
	});

	test("example 4 - import, pub invoke from main", () => {
		const lua = compile(`
import "Module:StringUtils" as str

fnc formatName(raw str) str {
    return language.getContentLanguage():ucfirst(raw | trim)
}

pub fnc renderCard {
    name = arg("name") | formatName
    title = arg("title", "Member")
    count = arg("edits", 0) as num

    output {
        <div class="user-card">
        <b>\${name}</b> - \${title}<br>
        Edits: \${count}<br>
        </div>
    }
}

fnc main {
    renderCard()
}
`);
		expect(lua).toContain('local str = require("Module:StringUtils")');
		expect(lua).toContain("renderCard(frame)");
		expect(lua).toContain("local function formatName(raw)");
	});

	test("example 5 - wikitext table building", () => {
		const lua = compile(`
fnc main {
    headers = ["Name", "Role", "Edits"]
    rows = [
        {name: "Alice", role: "Admin", edits: "7777"},
        {name: "Amamiya", role: "Editor", edits: "444"}
    ]
    output {
        {| class="wikitable"
        |-
    }
    for h in headers {
        output "! \${h}"
    }
    for row in rows {
        output {
            |-
            | \${row.name} || \${row.role} || \${row.edits}
        }
    }
    output { |} }
}`);
		expect(lua).toContain('{| class=\\"wikitable\\"');
		expect(lua).toContain("for __i1 = 1, #headers do");
		expect(lua).toContain("for __i2 = 1, #rows do");
		expect(lua).toContain("row.name");
	});
});

describe("language features", () => {
	test("default pipe", () => {
		const lua = compile(
			`fnc main { t = arg("title") | default("Main Page") output { \${t} } }`,
		);
		expect(lua).toContain("__estelle_default");
		expect(lua).toContain('"Main Page"');
	});

	test("+= preserves return after loop", () => {
		const lua = compile(
			`fnc main { out = "" for i in 1..3 { out += "x" } return out }`,
		);
		expect(lua).toContain('out = out .. "x"');
		expect(lua).toContain("return out");
	});

	test("literal as bool folds", () => {
		const lua = compile(
			`fnc main { if ("yes") as bool { output { on } } }`,
		);
		expect(lua).not.toContain("__estelle_bool");
		expect(lua).toContain('"on"');
	});

	test("+= string concat", () => {
		const lua = compile(`fnc main { out = "" out += "a" return out }`);
		expect(lua).toContain('out = out .. "a"');
	});

	test("+= number add", () => {
		const lua = compile(`fnc main { n = 1 n += 2 output { \${n} } }`);
		expect(lua).toContain("n = n + 2");
	});

	test("nullable type marker parses", () => {
		const r = transpile(
			`fnc f(x str?) str { return x } fnc main { output { ok } }`,
		);
		expect(r.lua).not.toBeNull();
	});

	test("bare ? is rejected", () => {
		const r = transpile(`fnc main { x = ? output { x } }`);
		expect(r.lua).toBeNull();
		expect(
			r.diagnostics.some((d) => /Unexpected "\?"/i.test(d.message)),
		).toBe(true);
	});

	test("default pipe without arg is rejected", () => {
		const r = transpile(`fnc main { x = arg("t") | default output { x } }`);
		expect(r.lua).toBeNull();
	});
});

describe("minify", () => {
	test("shrinks Lua output", () => {
		const src = `fnc main { output "Hello, world!" }`;
		const plain = transpile(src, { optimize: true }).lua!;
		const minified = transpile(src, { optimize: true, minify: true }).lua!;
		expect(minified.length).toBeLessThan(plain.length);
	});

	test("runs before embed so source comment is preserved", () => {
		const src = `fnc main { output "Hi" }`;
		const out = transpile(src, {
			optimize: true,
			minify: true,
			embed: true,
		}).lua!;
		expect(out.startsWith("--[[ESTESTART\n")).toBe(true);
		expect(out).toContain("ESTEEND]]\n");
		expect(out).not.toMatch(/\nlocal p = \{\}/);
	});
});
