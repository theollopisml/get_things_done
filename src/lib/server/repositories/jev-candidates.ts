import { and, asc, inArray, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { projects } from '$lib/server/db/schema';
import { MAX_RELATION_CANDIDATES } from '$lib/server/jev/classification';

export async function listEligibleRelationCandidates() {
	return db
		.select({ id: projects.id, title: projects.title })
		.from(projects)
		.where(and(isNull(projects.deletedAt), inArray(projects.status, ['planned', 'active'])))
		.orderBy(asc(projects.title), asc(projects.id))
		.limit(MAX_RELATION_CANDIDATES + 1);
}
