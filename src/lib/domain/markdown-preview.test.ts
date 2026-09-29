import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdownPreview, toggleMarkdownTask } from './markdown-preview';

describe('Markdown preview', () => {
	it('renders common blocks from the current source', () => {
		const blocks = parseMarkdownPreview(
			'# Plan\n\nUn **résumé** avec [lien](https://example.com).\n\n- [x] Fait\n- [ ] À faire\n\n```ts\nconst n = 1;\n```'
		);
		expect(blocks).toMatchObject([
			{ kind: 'heading', level: 1 },
			{ kind: 'paragraph' },
			{ kind: 'list', items: [{ checked: true }, { checked: false }] },
			{ kind: 'code', value: 'const n = 1;' }
		]);
	});

	it('keeps raw HTML as text and rejects script links', () => {
		expect(parseInline('<script>alert(1)</script>')).toEqual([
			{ kind: 'text', value: '<script>alert(1)</script>' }
		]);
		expect(parseInline('[bad](javascript:alert)')).toEqual([
			{ kind: 'text', value: '[bad](javascript:alert)' }
		]);
		expect(parseInline('`code` *italique* __gras__ [doc](/docs)')).toMatchObject([
			{ kind: 'code', value: 'code' },
			{ kind: 'text' },
			{ kind: 'emphasis', value: 'italique' },
			{ kind: 'text' },
			{ kind: 'strong', value: 'gras' },
			{ kind: 'text' },
			{ kind: 'link', href: '/docs' }
		]);
	});

	it('locates each task list item even when labels repeat or code contains a marker', () => {
		const blocks = parseMarkdownPreview(
			'```\n- [ ] example\n```\n\n- [ ] Same\n- [x] Same\n\n1. [ ] Ordered'
		);
		expect(blocks).toMatchObject([
			{ kind: 'code', value: '- [ ] example' },
			{
				kind: 'list',
				items: [
					{ checked: false, lineIndex: 4 },
					{ checked: true, lineIndex: 5 }
				]
			},
			{ kind: 'list', ordered: true, items: [{ checked: false, lineIndex: 7 }] }
		]);
	});

	it('toggles only the selected source marker without changing line endings or other text', () => {
		const source = '- [ ] Same\r\n- [x] Same\r\n\r\n1. [ ] Ordered';
		expect(toggleMarkdownTask(source, 1)).toBe('- [ ] Same\r\n- [ ] Same\r\n\r\n1. [ ] Ordered');
		expect(toggleMarkdownTask(source, 3)).toBe('- [ ] Same\r\n- [x] Same\r\n\r\n1. [x] Ordered');
		expect(toggleMarkdownTask(source, 2)).toBe(source);
		expect(toggleMarkdownTask(source, 99)).toBe(source);
		expect(toggleMarkdownTask(source, -1)).toBe(source);
	});
});
