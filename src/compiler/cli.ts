import { extname, resolve } from "node:path";
import { hasErrors, transpile } from "./index.ts";

interface CliIO {
	readonly cwd: () => string;
	readonly readFile: (path: string) => Promise<string>;
	readonly writeFile: (path: string, content: string) => Promise<void>;
	readonly stdout: (line: string) => void;
	readonly stderr: (line: string) => void;
}

interface CompileCommand {
	readonly kind: "compile";
	readonly inputPath: string;
	readonly outputPath: string;
	readonly optimize: boolean;
	readonly embed: boolean;
}

interface HelpCommand {
	readonly kind: "help";
}

interface ParseError {
	readonly kind: "error";
	readonly message: string;
}

type CliCommand = CompileCommand | HelpCommand | ParseError;

const USAGE = [
	"Usage:",
	"  estelle compile <input.este> [output.lua] [--optimize] [--embed]",
	"  estelle compile <input.este> --out <output.lua> [--optimize] [--embed]",
	"",
	"Flags:",
	"  --optimize    Enable optimization passes",
	"  --embed       Embed original Estelle source as Lua comment at top of output",
	"  --out, -o     Output Lua file path",
	"  --help, -h    Show this help",
].join("\n");

const DEFAULT_IO: CliIO = {
	cwd: () => process.cwd(),
	readFile: (path) => Bun.file(path).text(),
	writeFile: async (path, content) => {
		await Bun.write(path, content);
	},
	stdout: (line) => console.log(line),
	stderr: (line) => console.error(line),
};

function normalizeFlag(token: string): string {
	return token.endsWith("/") ? token.slice(0, -1) : token;
}

function defaultOutputPath(inputPath: string): string {
	const ext = extname(inputPath);
	if (ext.length === 0) return `${inputPath}.lua`;
	return `${inputPath.slice(0, -ext.length)}.lua`;
}

export function parseCliArgs(argv: readonly string[], cwd: string): CliCommand {
	if (argv.length === 0) return { kind: "help" };
	const first = normalizeFlag(argv[0]!);
	if (first === "--help" || first === "-h") return { kind: "help" };
	if (first !== "compile")
		return {
			kind: "error",
			message: `Unknown command "${argv[0]}". Expected "compile".`,
		};

	let inputArg: string | null = null;
	let outputArg: string | null = null;
	let optimize = false;
	let embed = false;

	for (let i = 1; i < argv.length; i++) {
		const raw = argv[i]!;
		const token = normalizeFlag(raw);
		if (token === "--help" || token === "-h") return { kind: "help" };
		if (token === "--optimize") {
			optimize = true;
			continue;
		}
		if (token === "--embed") {
			embed = true;
			continue;
		}
		if (token === "--out" || token === "-o") {
			const next = argv[i + 1];
			if (!next || next.startsWith("-"))
				return {
					kind: "error",
					message: `Missing value for ${raw}.`,
				};
			outputArg = next;
			i++;
			continue;
		}
		if (raw.startsWith("-"))
			return { kind: "error", message: `Unknown flag "${raw}".` };
		if (!inputArg) {
			inputArg = raw;
			continue;
		}
		if (!outputArg) {
			outputArg = raw;
			continue;
		}
		return { kind: "error", message: `Unexpected argument "${raw}".` };
	}

	if (!inputArg)
		return {
			kind: "error",
			message: "Missing input file. Use: estelle compile <input.este>",
		};

	const inputPath = resolve(cwd, inputArg);
	const outputPath = resolve(cwd, outputArg ?? defaultOutputPath(inputPath));
	return { kind: "compile", inputPath, outputPath, optimize, embed };
}

function formatDiagnostic(diag: {
	readonly severity: string;
	readonly message: string;
	readonly span?: { readonly start: number; readonly end: number };
}): string {
	const where =
		diag.span !== undefined ? ` @ ${diag.span.start}-${diag.span.end}` : "";
	return `[${diag.severity}] ${diag.message}${where}`;
}

export async function runCli(
	argv: readonly string[],
	io: CliIO = DEFAULT_IO,
): Promise<number> {
	const cmd = parseCliArgs(argv, io.cwd());
	if (cmd.kind === "help") {
		io.stdout(USAGE);
		return 0;
	}
	if (cmd.kind === "error") {
		io.stderr(cmd.message);
		io.stderr("");
		io.stderr(USAGE);
		return 2;
	}

	let source: string;
	try {
		source = await io.readFile(cmd.inputPath);
	} catch (error) {
		io.stderr(`Failed to read input: ${cmd.inputPath}`);
		io.stderr(error instanceof Error ? error.message : String(error));
		return 1;
	}

	const result = transpile(source, {
		optimize: cmd.optimize,
		embed: cmd.embed,
	});
	for (const diag of result.diagnostics) io.stderr(formatDiagnostic(diag));
	if (result.lua === null || hasErrors(result.diagnostics)) return 1;

	try {
		await io.writeFile(cmd.outputPath, result.lua);
	} catch (error) {
		io.stderr(`Failed to write output: ${cmd.outputPath}`);
		io.stderr(error instanceof Error ? error.message : String(error));
		return 1;
	}

	io.stdout(`Wrote ${cmd.outputPath}`);
	return 0;
}

if (import.meta.main) {
	runCli(process.argv.slice(2))
		.then((code) => {
			process.exit(code);
		})
		.catch((error) => {
			console.error(
				error instanceof Error ? error.message : String(error),
			);
			process.exit(1);
		});
}
