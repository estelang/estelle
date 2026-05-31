# Language Basics

## Comments

```este
// one line
count = 3

/* block
   comment */
```

## Types

| Type   | Meaning         |
| ------ | --------------- |
| `str`  | text            |
| `num`  | number          |
| `bool` | true/false      |
| `list` | ordered values  |
| `map`  | key-value table |

## Naming style

Use `snake_case` for user-defined names (variables, functions, params, aliases).
Built-ins keep their canonical names (for example `currentpage`, `addWarning`).

```este
fnc render_row(user_name str) {
    output "${user_name}"
}
```

## Variables and coercion

```este
user_name = "Alice"
count = arg("count", 0) as num
enabled = arg("enabled") as bool
```

## Operators

- math: `+ - * / %`
- compare: `== != > < >= <=`
- logic: `and or not`

## Strings and interpolation

```este
output "User: ${user_name}, count: ${count}"
```

## Pipes

```este
clean_text = arg("text", "") | trim | lower
```

## `nil`

```este
user_name = arg("name")
if user_name == nil { user_name = "Guest" }
```

Next:

- **[Functions](./functions.md)**
- **[Control Flow](./control-flow.md)**
- **[Built-ins](./builtins.md)**
