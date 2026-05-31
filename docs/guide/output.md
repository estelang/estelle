# Output

`output` appends text to the function result.

## Single-line output

```este
output "Hello"
user_name = arg("name", "Guest")
output "User: ${user_name}"
```

## Multi-line output

Use `output { ... }` for wikitext blocks.

```este
output {
== Title ==
[[Main Page]]
}
```

## Wikitext is literal

```este
output "'''bold'''"
output "[[Page]]"
```

## Escaping user content

```este
safe_text = text.nowiki(arg("text", ""))
output safe_text
```

## Early return

```este
if arg("name") == nil {
    output "Missing name"
    return
}
```

Next:

- **[Control Flow](./control-flow.md)**
- **[Built-ins](./builtins.md)**
