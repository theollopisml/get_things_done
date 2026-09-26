import { env } from '$env/dynamic/private';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/auth-schema';
import { validateGitHubOwner } from './owner';

export const auth = betterAuth({
	baseURL: env.BETTER_AUTH_URL,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'pg', schema }),
	user: {
		validateUserInfo: ({ source }) => validateGitHubOwner(source, env.OWNER_GITHUB_ID)
	},
	socialProviders: {
		github: {
			clientId: env.GITHUB_CLIENT_ID ?? '',
			clientSecret: env.GITHUB_CLIENT_SECRET ?? ''
		}
	}
});
