import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { parseCliArgs, runCli } from "./cli.ts";

const TEST_CWD = resolve("/estelle-cli-test");

function pathInCwd(...segments: string[]): string {
	return resolve(TEST_CWD, ...segments);
}

describe("parseCliArgs", () => {
	test("parses compile with optimize and explicit out flag", () => {
		const parsed = parseCliArgs(
			["compile", "a.este", "--optimize", "--out", "a.lua"],
			TEST_CWD,
		);
		expect(parsed.kind).toBe("compile");
		if (parsed.kind !== "compile") return;
		expect(parsed.optimize).toBe(true);
		expect(parsed.inputPath).toBe(pathInCwd("a.este"));
		expect(parsed.outputPath).toBe(pathInCwd("a.lua"));
	});

	test("accepts --optimize/ alias", () => {
		const parsed = parseCliArgs(
			["compile", "a.este", "--optimize/"],
			TEST_CWD,
		);
		expect(parsed.kind).toBe("compile");
		if (parsed.kind !== "compile") return;
		expect(parsed.optimize).toBe(true);
	});

	test("parses --minify", () => {
		const parsed = parseCliArgs(
			["compile", "a.este", "--minify", "--embed"],
			TEST_CWD,
		);
		expect(parsed.kind).toBe("compile");
		if (parsed.kind !== "compile") return;
		expect(parsed.minify).toBe(true);
		expect(parsed.embed).toBe(true);
	});

	test("defaults output to input basename with .lua", () => {
		const parsed = parseCliArgs(["compile", "hello.este"], TEST_CWD);
		expect(parsed.kind).toBe("compile");
		if (parsed.kind !== "compile") return;
		expect(parsed.outputPath).toBe(pathInCwd("hello.lua"));
	});
});

describe("runCli", () => {
	test("compiles input and writes output file", async () => {
		const files = new Map<string, string>([
			[pathInCwd("hello.este"), `fnc main { output "Hello, world!" }`],
		]);
		const out: string[] = [];
		const err: string[] = [];

		const code = await runCli(["compile", "hello.este", "--optimize"], {
			cwd: () => TEST_CWD,
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
		const lua = files.get(pathInCwd("hello.lua"));
		expect(lua).toContain("local p = {}");
		expect(lua).toContain("return p");
		expect(out[0]).toContain(pathInCwd("hello.lua"));
	});

	test("minifies output with --minify", async () => {
		const source = `fnc main { output "Hello, world!" }`;
		const files = new Map<string, string>([
			[pathInCwd("hello.este"), source],
		]);

		const plain = await runCli(["compile", "hello.este", "--optimize"], {
			cwd: () => TEST_CWD,
			readFile: async (path) => files.get(path)!,
			writeFile: async (path, content) => {
				files.set(path, content);
			},
			stdout: () => {},
			stderr: () => {},
		});
		expect(plain).toBe(0);
		const unminified = files.get(pathInCwd("hello.lua"))!;

		const code = await runCli(
			["compile", "hello.este", "--optimize", "--minify"],
			{
				cwd: () => TEST_CWD,
				readFile: async (path) => files.get(path)!,
				writeFile: async (path, content) => {
					files.set(path, content);
				},
				stdout: () => {},
				stderr: () => {},
			},
		);
		expect(code).toBe(0);
		const minified = files.get(pathInCwd("hello.lua"))!;
		expect(minified.length).toBeLessThan(unminified.length);
		expect(minified).not.toContain("local p = {}");
	});
});
