# Tables

Estelle has:

- **list**: ordered values (1-indexed)
- **map**: key-value table

## Lists

```este
items = ["a", "b", "c"]
first_item = items[1]
count = len(items)
```

Update list values:

```este
push(items, "d")
last_item = pop(items)
```

## Maps

```este
user = {name: "Alice", role: "Admin"}
output user.name
output user["role"]
```

## Iteration

```este
for item in items {
    output item
}

for key, value in user {
    output "${key}: ${value}"
}
```
