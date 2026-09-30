// Deliberately independent of .env and DATABASE_URL: E2E never uses the owner's database.
export const databaseURL =
	process.env.E2E_DATABASE_URL ??
	'postgresql://postgres:postgres@127.0.0.1:5432/get_things_done_e2e';
const database = new URL(databaseURL);
if (
	!['postgres:', 'postgresql:'].includes(database.protocol) ||
	!['localhost', '127.0.0.1', '[::1]'].includes(database.hostname) ||
	database.pathname !== '/get_things_done_e2e'
) {
	throw new Error('E2E requires a local PostgreSQL database named get_things_done_e2e.');
}

export const baseURL = 'http://127.0.0.1:4173';
export const authSecret = 'e2e-only-secret-6e78c3b520dd4599b250df5fab30ee8a';
export const ownerId = '123456789';
