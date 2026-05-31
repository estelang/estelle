import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { parseCliArgs, runCli } from "./cli.ts";

describe("parseCliArgs", () => {
	test("parses compile with optimize and explicit out flag", () => {
		const cwd = "C:\\repo";
		const parsed = parseCliArgs(
			["compile", "a.este", "--optimize", "--out", "a.lua"],
			cwd,
		);
		expect(parsed.kind).toBe("compile");
		if (parsed.kind !== "compile") return;
		expect(parsed.optimize).toBe(true);
		expect(parsed.inputPath).toBe(resolve(cwd, "a.este"));
		expect(parsed.outputPath).toBe(resolve(cwd, "a.lua"));
	});

	test("accepts --optimize/ alias", () => {
		const parsed = parseCliArgs(
			["compile", "a.este", "--optimize/"],
			"C:\\x",
		);
		expect(parsed.kind).toBe("compile");
		if (parsed.kind !== "compile") return;
		expect(parsed.optimize).toBe(true);
	});

	test("defaults output to input basename with .lua", () => {
		const cwd = "C:\\repo";
		const parsed = parseCliArgs(["compile", "hello.este"], cwd);
		expect(parsed.kind).toBe("compile");
		if (parsed.kind !== "compile") return;
		expect(parsed.outputPath).toBe(resolve(cwd, "hello.lua"));
	});
});

describe("runCli", () => {
	test("compiles input and writes output file", async () => {
		const cwd = "C:\\repo";
		const files = new Map<string, string>([
			[resolve(cwd, "hello.este"), `fnc main { output "Hello, world!" }`],
		]);
		const out: string[] = [];
		const err: string[] = [];

		const code = await runCli(["compile", "hello.este", "--optimize"], {
			cwd: () => cwd,
			readFile: async (path) => {
				const value = files.get(path);
				if (value === undefined) throw new Error("missing");
				return value;
			},
			writeFile: async (path, content) => {
				files.set(path, content);
			},
			stdout: (line) => out.push(line),
			stderr: (line) => err.push(line),
		});

		expect(code).toBe(0);
		expect(err.length).toBe(0);
		const lua = files.get(resolve(cwd, "hello.lua"));
		expect(lua).toContain("local p = {}");
		expect(lua).toContain("return p");
		expect(out[0]).toContain(resolve(cwd, "hello.lua"));
	});
});
