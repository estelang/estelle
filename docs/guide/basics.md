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

Append `?` for nullable parameters (for example `spoiler_id str?`). This is a type marker only; use `nil` checks at runtime.

## Naming style

Use `snake_case` for user-defined names (variables, functions, params, aliases).
Built-ins keep their canonical names (for example `currentpage`, `addWarning`).

```este
fnc render_row(user_name str) {
    output "${user_name}"
}
```

## Variables and coercion

Use `as` on an expression (including in `if` conditions):

```este
user_name = "Alice"
count = arg("count", 0) as num
enabled = arg("enabled") as bool
if arg("collapsed", "no") as bool {
    output "collapsed"
}
```

`as bool` treats `true`, `1`, `yes`, `y`, and `on` as true (case-insensitive, trimmed).

## Defaults with pipes

```este
title = arg("title") | trim | default("Main Page")
```

`default` replaces `nil` and empty string.

## Compound assignment

```este
out = ""
out += "hello "
out += name
i = 0
i += 1
```

`+=` appends with `..` for strings, or adds for numbers.

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
