export type Inline =
	| { kind: 'text' | 'code' | 'strong' | 'emphasis'; value: string }
	| { kind: 'link'; value: string; href: string };

export type MarkdownBlock =
	| { kind: 'heading'; level: number; content: Inline[] }
	| { kind: 'paragraph'; content: Inline[] }
	| { kind: 'code'; value: string }
	| { kind: 'list'; ordered: boolean; items: { checked: boolean | null; content: Inline[] }[] };

function safeHref(value: string): string | null {
	if (/^(https?:\/\/|mailto:|\/(?!\/)|#|\.\.?\/)/i.test(value)) return value;
	if (!/^[a-z][a-z\d+.-]*:/i.test(value) && !value.startsWith('//')) return value;
	return null;
}

export function parseInline(source: string): Inline[] {
	const result: Inline[] = [];
	const pattern =
		/`([^`\n]+)`|\[([^\]]+)\]\(([^\s)]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_/g;
	let last = 0;
	for (const match of source.matchAll(pattern)) {
		const index = match.index;
		if (index > last) result.push({ kind: 'text', value: source.slice(last, index) });
		if (match[1] !== undefined) result.push({ kind: 'code', value: match[1] });
		else if (match[2] !== undefined) {
			const href = safeHref(match[3]);
			result.push(
				href ? { kind: 'link', value: match[2], href } : { kind: 'text', value: match[0] }
			);
		} else if (match[4] !== undefined || match[5] !== undefined)
			result.push({ kind: 'strong', value: match[4] ?? match[5] });
		else result.push({ kind: 'emphasis', value: match[6] ?? match[7] });
		last = index + match[0].length;
	}
	if (last < source.length) result.push({ kind: 'text', value: source.slice(last) });
	return result;
}

function listLine(line: string) {
	const match = /^\s{0,3}([-*+]|\d+\.)\s+(.+)$/.exec(line);
	if (!match) return null;
	const checkbox = /^\[([ xX])\]\s+(.+)$/.exec(match[2]);
	return {
		ordered: /\d/.test(match[1]),
		checked: checkbox ? checkbox[1].toLowerCase() === 'x' : null,
		content: parseInline(checkbox ? checkbox[2] : match[2])
	};
}

export function parseMarkdownPreview(source: string): MarkdownBlock[] {
	const lines = source.replace(/\r\n?/g, '\n').split('\n');
	const blocks: MarkdownBlock[] = [];
	let index = 0;
	while (index < lines.length) {
		const line = lines[index];
		if (!line.trim()) {
			index++;
			continue;
		}
		if (/^\s{0,3}```/.test(line)) {
			const code: string[] = [];
			index++;
			while (index < lines.length && !/^\s{0,3}```/.test(lines[index])) code.push(lines[index++]);
			if (index < lines.length) index++;
			blocks.push({ kind: 'code', value: code.join('\n') });
			continue;
		}
		const heading = /^\s{0,3}(#{1,6})\s+(.+)$/.exec(line);
		if (heading) {
			blocks.push({ kind: 'heading', level: heading[1].length, content: parseInline(heading[2]) });
			index++;
			continue;
		}
		const firstItem = listLine(line);
		if (firstItem) {
			const items = [firstItem];
			index++;
			while (index < lines.length) {
				const item = listLine(lines[index]);
				if (!item || item.ordered !== firstItem.ordered) break;
				items.push(item);
				index++;
			}
			blocks.push({ kind: 'list', ordered: firstItem.ordered, items });
			continue;
		}
		const paragraph = [line.trim()];
		index++;
		while (
			index < lines.length &&
			lines[index].trim() &&
			!/^\s{0,3}(```|#{1,6}\s)/.test(lines[index]) &&
			!listLine(lines[index])
		) {
			paragraph.push(lines[index++].trim());
		}
		blocks.push({ kind: 'paragraph', content: parseInline(paragraph.join(' ')) });
	}
	return blocks;
}
