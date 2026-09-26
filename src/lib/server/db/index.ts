import { env } from '$env/dynamic/private';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const url = env.DATABASE_URL;

if (!url) {
	throw new Error('DATABASE_URL is required to access the database');
}

export const client = postgres(url);
export const db = drizzle({ client, schema });
