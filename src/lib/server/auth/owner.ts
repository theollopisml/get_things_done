type OAuthSource = {
	method: string;
	oauth?: {
		providerId: string;
		profile?: Record<string, unknown>;
	};
};

const ownerOnlyError = {
	error: 'owner_only',
	errorDescription: 'This GitHub account is not allowed to sign in'
} as const;

export function validateGitHubOwner(source: OAuthSource, ownerGitHubId: string | undefined) {
	const profileId = source.oauth?.profile?.id;
	const githubId =
		typeof profileId === 'number' && Number.isSafeInteger(profileId) && profileId > 0
			? String(profileId)
			: profileId;

	if (
		source.method === 'oauth' &&
		source.oauth?.providerId === 'github' &&
		ownerGitHubId &&
		/^[1-9]\d*$/.test(ownerGitHubId) &&
		githubId === ownerGitHubId
	) {
		return;
	}

	return ownerOnlyError;
}
