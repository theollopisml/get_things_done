import { describe, expect, it } from 'vitest';
import { validateGitHubOwner } from './owner';

const githubSource = (id: unknown) => ({
	method: 'oauth',
	oauth: { providerId: 'github', profile: { id } }
});

describe('validateGitHubOwner', () => {
	it('accepts the configured GitHub ID even when the profile has no email', () => {
		expect(validateGitHubOwner(githubSource(12345), '12345')).toBeUndefined();
	});

	it('rejects another GitHub account', () => {
		expect(validateGitHubOwner(githubSource(67890), '12345')).toMatchObject({
			error: 'owner_only'
		});
	});

	it('fails closed when the owner ID or provider profile is missing', () => {
		expect(validateGitHubOwner(githubSource(12345), undefined)).toMatchObject({
			error: 'owner_only'
		});
		expect(validateGitHubOwner(githubSource(12345), '')).toMatchObject({
			error: 'owner_only'
		});
		expect(validateGitHubOwner(githubSource(undefined), '12345')).toMatchObject({
			error: 'owner_only'
		});
	});

	it('rejects other providers and authentication methods', () => {
		expect(
			validateGitHubOwner(
				{ method: 'oauth', oauth: { providerId: 'google', profile: { id: 12345 } } },
				'12345'
			)
		).toMatchObject({ error: 'owner_only' });
		expect(validateGitHubOwner({ method: 'email-password' }, '12345')).toMatchObject({
			error: 'owner_only'
		});
	});
});
