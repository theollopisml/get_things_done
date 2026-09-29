import { and, desc, eq, isNull, or, sql, type AnyColumn } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { checkpoints, projects, tasks } from '$lib/server/db/schema';

const limitPerType = 5;
const accentGroups = [
	['àáâãäåāăą', 'a'],
	['çćč', 'c'],
	['ď', 'd'],
	['èéêëēėęě', 'e'],
	['ìíîïīį', 'i'],
	['ł', 'l'],
	['ñńň', 'n'],
	['òóôõöøō', 'o'],
	['ř', 'r'],
	['śš', 's'],
	['ť', 't'],
	['ùúûüūůű', 'u'],
	['ýÿ', 'y'],
	['žźż', 'z']
] as const;
const accented = accentGroups.map(([letters]) => letters).join('');
const plain = accentGroups.map(([letters, letter]) => letter.repeat(letters.length)).join('');

function patternFor(query: string) {
	const folded = query
		.toLowerCase()
		.normalize('NFD')
		.replace(/\p{M}/gu, '')
		.replaceAll('œ', 'oe')
		.replaceAll('æ', 'ae')
		.replaceAll('ø', 'o')
		.replaceAll('ł', 'l');
	return `%${folded.replace(/[!%_]/g, '!$&')}%`;
}

function matches(column: AnyColumn, pattern: string) {
	return sql`translate(replace(replace(lower(normalize(${column}, NFC)), 'œ', 'oe'), 'æ', 'ae'), ${accented}, ${plain}) ILIKE ${pattern} ESCAPE '!'`;
}

export async function searchGlobal(query: string) {
	const pattern = patternFor(query);
	const [taskResults, projectResults, checkpointResults] = await Promise.all([
		db
			.select({
				id: tasks.id,
				title: tasks.title,
				status: tasks.status,
				projectId: tasks.projectId,
				projectTitle: projects.title,
				projectDeleted: projects.deletedAt
			})
			.from(tasks)
			.leftJoin(projects, eq(tasks.projectId, projects.id))
			.where(
				and(
					isNull(tasks.deletedAt),
					or(matches(tasks.title, pattern), matches(tasks.description, pattern))
				)
			)
			.orderBy(
				sql`case when ${matches(tasks.title, pattern)} then 0 else 1 end`,
				desc(tasks.updatedAt)
			)
			.limit(limitPerType),
		db
			.select({ id: projects.id, title: projects.title, status: projects.status })
			.from(projects)
			.where(
				and(
					isNull(projects.deletedAt),
					or(matches(projects.title, pattern), matches(projects.description, pattern))
				)
			)
			.orderBy(
				sql`case when ${matches(projects.title, pattern)} then 0 else 1 end`,
				desc(projects.updatedAt)
			)
			.limit(limitPerType),
		db
			.select({
				id: checkpoints.id,
				title: checkpoints.title,
				status: checkpoints.status,
				projectId: checkpoints.projectId,
				projectTitle: projects.title
			})
			.from(checkpoints)
			.innerJoin(projects, eq(checkpoints.projectId, projects.id))
			.where(
				and(
					isNull(checkpoints.deletedAt),
					isNull(projects.deletedAt),
					or(matches(checkpoints.title, pattern), matches(checkpoints.description, pattern))
				)
			)
			.orderBy(
				sql`case when ${matches(checkpoints.title, pattern)} then 0 else 1 end`,
				desc(checkpoints.updatedAt)
			)
			.limit(limitPerType)
	]);

	return {
		tasks: taskResults.map(({ projectDeleted, ...task }) => ({
			...task,
			projectId: projectDeleted ? null : task.projectId,
			projectTitle: projectDeleted ? null : task.projectTitle
		})),
		projects: projectResults,
		checkpoints: checkpointResults
	};
}
