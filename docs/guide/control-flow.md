# Control Flow

## Conditions

```este
if score >= 90 {
    output "A"
} else if score >= 80 {
    output "B"
} else {
    output "C"
}
```

## Loops

### List loop

```este
for item in items {
    output "* ${item}"
}
```

### Indexed list loop

```este
for i, item in items {
    output "${i}. ${item}"
}
```

### Map loop

```este
for key, value in data_map {
    output "${key}: ${value}"
}
```

### While / repeat

```este
while i < 10 { i = i + 1 }
repeat 3 { output "x" }
```

### Break / continue

```este
for item in items {
    if item == "" { continue }
    if item == "stop" { break }
    output item
}
```

## Error handling

```este
try {
    output page("Main Page").content
} catch err {
    output "Error: ${err}"
}
```
