import { describe, expect, it } from 'vitest';
import { normalizeSearchQuery } from './search';

describe('search query', () => {
	it('trims input and leaves empty searches empty', () => {
		expect(normalizeSearchQuery('  portfolio  ')).toBe('portfolio');
		expect(normalizeSearchQuery('   ')).toBe('');
		expect(normalizeSearchQuery(null)).toBe('');
	});

	it('bounds query length', () => {
		expect(() => normalizeSearchQuery('a'.repeat(201))).toThrow('200 caractères');
	});
});
