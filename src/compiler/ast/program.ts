import type { Stmt } from "./statements.ts";

export type EstelleType = "str" | "num" | "bool" | "list" | "map";

export interface Program {
	readonly kind: "Program";
	readonly imports: readonly ImportDecl[];
	readonly fncs: readonly FncDecl[];
}

export interface ImportDecl {
	readonly kind: "Import";
	readonly path: string;
	readonly alias: string;
}

export interface Param {
	readonly name: string;
	readonly type: EstelleType;
	readonly nullable: boolean;
}

export interface FncDecl {
	readonly kind: "Fnc";
	readonly pub: boolean;
	readonly name: string;
	readonly params: readonly Param[];
	readonly returnType: EstelleType | null;
	readonly body: readonly Stmt[];
}
