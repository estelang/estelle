# Functions

## Declare and call

```este
fnc add(a num, b num) num {
    return a + b
}

fnc main {
    output "${add(2, 3)}"
}
```

## Entry functions

- `main` is the default `#invoke` target.
- `pub fnc` exposes additional entry points.

```este
pub fnc render {
    output "ok"
}
```

<span v-pre>Call with `{{#invoke:ModuleName|render}}`.</span>

## Arguments

Use `arg(name, default?)` inside invoke-scoped functions.

```este
fnc main {
    page_title = arg("title", "Main Page")
    output page_title
}
```

## Nested functions

```este
fnc main {
    fnc make_label(x str) str { return "* ${x}" }
    output make_label("Item")
}
```

## Thin lambdas

```este
double = (x) => x * 2
```

Next:

- **[Output](./output.md)**
- **[Control Flow](./control-flow.md)**
