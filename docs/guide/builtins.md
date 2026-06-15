# Built-ins

Built-ins and namespace roots recognized by the compiler.

## Core built-ins

| Category                 | Names                                                                                                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arguments                | `arg`                                                                                                                                                                  |
| Strings                  | `trim`, `lower`, `upper`, `sub`, `find`, `replace`, `split`, `join`                                                                                                    |
| Numbers                  | `floor`, `ceil`, `abs`, `round`, `tonum`, `tostr`                                                                                                                      |
| Length                   | `len`                                                                                                                                                                  |
| Lists                    | `push`, `pop`, `has`                                                                                                                                                   |
| Padding                  | `padleft`, `padright`                                                                                                                                                  |
| Defaults                 | `default`                                                                                                                                                              |
| Page                     | `page`, `currentpage`                                                                                                                                                  |
| Direct Scribunto globals | `addWarning`, `allToString`, `clone`, `getCurrentFrame`, `incrementExpensiveFunctionCount`, `isSubsting`, `loadData`, `loadJsonData`, `dumpObject`, `log`, `logObject` |

## Namespaced Scribunto library

Roots (mirrors the compiler):

- `text.*` -> `mw.text.*`
- `uri.*` -> `mw.uri.*`
- `ustring.*` -> `mw.ustring.*`
- `title.*` -> `mw.title.*`
- `html.*` -> `mw.html.*`
- `svg.*` -> `mw.svg.*`
- `hash.*` -> `mw.hash.*`
- `language.*`, `message.*`, `site.*`

Special-cased members:

| Root       | Namespace calls                                                                                                                                                      | Object members                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `text`     | `split`                                                                                                                                                              | —                                                                                          |
| `uri`      | `buildQueryString`, `parseQueryString`, `validate`                                                                                                                   | —                                                                                          |
| `ustring`  | `lower`, `upper`, `sub`, `format`, `rep`, `toNFC`, `toNFD`, `toNFKC`, `toNFKD`, `len`, `isutf8`                                                                      | —                                                                                          |
| `title`    | `new`, `getCurrentTitle`                                                                                                                                             | `equals`, `compare`, `fullUrl`, `localUrl`, `canonicalUrl`, `content`                      |
| `language` | `fetchLanguageName`, `getContentLanguage`, `fetchLanguageNames`, `isKnownLanguageTag`, `isSupportedLanguage`, `isValidBuiltInCode`, `isValidCode`, `getFallbacksFor` | `getCode`, `toBcp47Code`, `lc`, `uc`, `lcfirst`, `ucfirst`, `isRTL`                        |
| `message`  | `new`, `newRawMessage`, `newFallbackSequence`, `rawParam`, `numParam`, `getDefaultLanguage`                                                                          | `plain`, `rawParam`, `exists`, `isBlank`, `isDisabled`, `numParams`, `params`, `rawParams` |

`title.content` lowers to `title:getContent()`.

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

`default` in a pipe:

```este
title = arg("title") | trim | default("Main Page")
```
