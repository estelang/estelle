# Built-ins

This page lists practical built-ins. For full language details, see `spec.md`.

## Core built-ins

### String

`trim`, `lower`, `upper`, `sub`, `find`, `replace`, `split`, `join`, `len`

### Wikitext

Use namespace mappings directly:

- `text.nowiki(...)`
- `text.encode(...)`
- `text.trim(...)`
- `language.getContentLanguage():ucfirst(...)`
- `language.getContentLanguage():lcfirst(...)`
- `uri.encode(...)`
- `uri.decode(...)`

### Number

`floor`, `ceil`, `abs`, `round`, `tonum`, `tostr`

### List

`push`, `pop`, `has`, `len`

### Page

`page`, `currentpage`

### Utility

`padleft`, `padright`

## Direct Scribunto mappings available as built-in call names

`addWarning`, `allToString`, `clone`, `getCurrentFrame`, `incrementExpensiveFunctionCount`, `isSubsting`, `loadData`, `loadJsonData`, `dumpObject`, `log`, `logObject`

## Namespaced Scribunto access

Use these roots directly when needed:

- `text.*` → `mw.text.*`
- `uri.*` → `mw.uri.*`
- `ustring.*` → `mw.ustring.*`
- `title.*` → `mw.title.*`
- `html.*` → `mw.html.*`
- `svg.*` → `mw.svg.*`
- `hash.*` → `mw.hash.*`
- `language.*`, `message.*`, `site.*`

## Notes

- Non-builtin user identifiers should be `snake_case`.
- Lua globals like `type`, `tonumber`, `tostring`, `pairs`, `pcall` are callable directly.
- `len(...)` must be inferable as string or list; ambiguous `len` is a compile error.
- Shorthand wrappers like `wikiescape(...)`, `uc(...)`, `urlencode(...)` are removed; use namespace mappings above.

## Example

```este
fnc main {
    raw_items = arg("items", "")
    items = raw_items | split(",")
    if len(items) > 0 {
        output join(items, " | ")
    }
}
```
