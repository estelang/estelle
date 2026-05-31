---
layout: home

hero:
    name: "Estelle"
    text: "A language for wiki editors"
    tagline: Write Scribunto modules without the hassle.
    actions:
        - theme: brand
          text: Quick Start
          link: /quickstart
        - theme: alt
          text: Guide
          link: /guide/introduction

features:
    - title: Wikitext-first output
      details: Use `output "..."` and `output { ... }` for wiki text generation.
    - title: Scribunto-compatible compile target
      details: Compiles to Lua 5.1 module style (`local p = {}; return p`).
    - title: Gradual escape hatch
      details: Use `lua { ... }` when you need direct Scribunto/Lua APIs.
---
