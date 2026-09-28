import { describe, expect, it } from 'vitest';
import { hasContent, splitCapture } from './capture';

describe('capture content', () => {
	it('uses the first non-empty line as title and preserves multiline Markdown', () => {
		expect(
			splitCapture(
				'\n  Refaire mon CV  \r\n\r\nAjouter mon expérience.\r\n- Vérifier les dates\r\n'
			)
		).toEqual({
			title: 'Refaire mon CV',
			description: 'Ajouter mon expérience.\n- Vérifier les dates'
		});
	});

	it('accepts a title without a description and rejects whitespace only', () => {
		expect(splitCapture('  Une idée  ')).toEqual({ title: 'Une idée', description: null });
		expect(hasContent(' \n ')).toBe(false);
		expect(() => splitCapture(' \n ')).toThrow('Capture vide');
	});
});
