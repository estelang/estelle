# Introduction

Estelle is a language that compiles to Scribunto Lua.

Typical workflow:

1. Write `.este`.
2. Compile to `.lua`.
3. Call from `#invoke`.

## Example

```este
fnc main {
    page_title = arg("title", "Main Page")
    output "Page: [[${page_title}]]"
}
```

## What is in scope

- Functions (`fnc`, `pub fnc`)
- Conditionals and loops
- Lists/maps
- Pipes (`value | trim | lower`)
- `try` / `catch`
- `lua { ... }` escape blocks

Continue with:

- **[Language Basics](./basics.md)**
- **[Functions](./functions.md)**
- **[Built-ins](./builtins.md)**
