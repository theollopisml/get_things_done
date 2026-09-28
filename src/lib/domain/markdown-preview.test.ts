import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdownPreview } from './markdown-preview';

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
});
