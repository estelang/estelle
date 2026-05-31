# Examples

## 1) Normalize optional argument

```este
fnc main {
    raw_title = arg("title")
    title = raw_title
    if title != nil { title = title | trim }
    if title == nil or title == "" { title = "Main Page" }
    output "Title: [[${title}]]"
}
```

## 2) Boolean-like template flag

```este
fnc main {
    flag_value = arg("collapsed", "no") | trim | lower
    is_collapsed = (flag_value == "yes" or flag_value == "y" or flag_value == "1" or flag_value == "true")
    if is_collapsed {
        output "State: collapsed"
    } else {
        output "State: expanded"
    }
}
```

## 3) Skip empty infobox row

```este
fnc main {
    label = arg("label")
    value = arg("value")
    if label == nil or value == nil { return "" }
    label = label | trim
    value = value | trim
    if label == "" or value == "" { return "" }
    output "|-\n! ${label}\n| ${value}"
}
```

## 4) Expand template via frame method

```este
fnc main {
    page_name = arg("page", "Main Page")
    icon_size = arg("size", "22x20px")
    rendered = ""
    lua {
        rendered = frame:expandTemplate{
            title = "Icon",
            args = { page = page_name, size = icon_size }
        }
    }
    output rendered
}
```

## 5) Page existence check

```este
fnc main {
    page_name = arg("page")
    if page_name == nil or page_name | trim == "" {
        output "Missing page parameter."
        return
    }

    t = page(page_name | trim)
    if t.exists {
        output "Page exists: [[${t.text}]]"
    } else {
        output "Page does not exist: [[${page_name}]]"
    }
}
```

## 6) Wikitable from argument rows

```este
fnc main {
    rows = arg("rows", "") | split(";")

    output {
{| class="wikitable sortable"
! Name !! Score
}

    for row in rows {
        parts = row | split(",")
        if len(parts) < 2 { continue }

        name = parts[1] | trim
        score = parts[2] | trim
        if name == "" or score == "" { continue }

        output "|-\n| ${name} || ${score}"
    }

    output { |} }
}
```
