# Quick Start

## 1) Write `hello.este`

```este
fnc main {
    user_name = arg("name", "World")
    output "Hello, ${user_name}!"
}
```

## 2) Compile

```sh
estelle compile hello.este
```

This writes `hello.lua` by default.

## 3) Use in wiki

```wikitext
{{#invoke:hello|main|name=Alice}}
```

## CLI flags

```sh
estelle compile hello.este --optimize
estelle compile hello.este --embed
estelle compile hello.este --out Module:Hello.lua
estelle compile hello.este -o Module:Hello.lua
```

- `--optimize`: run optimizer passes.
- `--embed`: embed source in a Lua block comment header.
- `--out` / `-o`: explicit output path.

Next:

- **[Language Basics](./guide/basics.md)**
- **[Functions](./guide/functions.md)**
- **[Output](./guide/output.md)**
