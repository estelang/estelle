# Lua Escape

Use `lua { ... }` for Scribunto/Lua behavior not modeled directly in Estelle.

## Example

```este
fnc main {
    page_name = arg("page", "Main Page")
    exists = false
    lua {
        local t = mw.title.new(page_name)
        exists = t and t.exists or false
    }
    output "Exists: ${exists}"
}
```

## Scope rule

- Assignment without `local` is visible after the block.
- Assignment with `local` stays inside the block.

```este
lua {
    x = 1
    local y = 2
}
output x
```
