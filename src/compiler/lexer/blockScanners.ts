export function findLuaBlockEnd(src: string, start: number): number {
	let depth = 1;
	let i = start;
	const n = src.length;
	while (i < n) {
		const c = src[i];
		if (c === "-" && src[i + 1] === "-") {
			if (src[i + 2] === "[" && src[i + 3] === "[") {
				i += 4;
				while (i < n && !(src[i] === "]" && src[i + 1] === "]")) i++;
				i += 2;
				continue;
			}
			i += 2;
			while (i < n && src[i] !== "\n") i++;
			continue;
		}
		if (c === '"' || c === "'") {
			const q = c;
			i++;
			while (i < n && src[i] !== q) {
				if (src[i] === "\\") i++;
				i++;
			}
			i++;
			continue;
		}
		if (c === "[" && src[i + 1] === "[") {
			i += 2;
			while (i < n && !(src[i] === "]" && src[i + 1] === "]")) i++;
			i += 2;
			continue;
		}
		if (c === "{") depth++;
		else if (c === "}") {
			depth--;
			if (depth === 0) return i;
		}
		i++;
	}
	return -1;
}

export function findOutputBlockEnd(src: string, start: number): number {
	let depth = 1;
	let i = start;
	while (i < src.length) {
		const c = src[i];
		// {| is wikitext table open — don't count as nested brace
		if (c === "{" && (src[i + 1] ?? "") !== "|") depth++;
		// |} is wikitext table close — don't count as closing brace
		else if (c === "}" && src[i - 1] !== "|") {
			if (--depth === 0) return i;
		}
		i++;
	}
	return -1;
}
