export type Expr =
	| { readonly kind: "String"; readonly value: string }
	| { readonly kind: "Number"; readonly value: number }
	| { readonly kind: "Bool"; readonly value: boolean }
	| { readonly kind: "Nil" }
	| { readonly kind: "Ident"; readonly name: string }
	| {
			readonly kind: "Member";
			readonly object: Expr;
			readonly property: string;
	  }
	| { readonly kind: "Index"; readonly object: Expr; readonly index: Expr }
	| { readonly kind: "List"; readonly items: readonly Expr[] }
	| {
			readonly kind: "Map";
			readonly entries: readonly { key: string; value: Expr }[];
	  }
	| {
			readonly kind: "Call";
			readonly callee: Expr;
			readonly args: readonly Expr[];
	  }
	| {
			readonly kind: "MethodCall";
			readonly object: Expr;
			readonly method: string;
			readonly form:
				| { readonly kind: "args"; readonly args: readonly Expr[] }
				| { readonly kind: "table"; readonly table: Expr };
	  }
	| { readonly kind: "Unary"; readonly op: "not" | "-"; readonly right: Expr }
	| {
			readonly kind: "Binary";
			readonly op:
				| "or"
				| "and"
				| "=="
				| "!="
				| ">"
				| "<"
				| ">="
				| "<="
				| "+"
				| "-"
				| "*"
				| "/"
				| "%"
				| "..";
			readonly left: Expr;
			readonly right: Expr;
	  }
	| {
			readonly kind: "Lambda";
			readonly params: readonly string[];
			readonly body: Expr;
	  };
