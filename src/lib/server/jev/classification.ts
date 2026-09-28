import type { ClassifiedKind } from '$lib/domain/capture';
import type { ChoiceRequest, ChoiceResult } from './client';

export const MAX_RELATION_CANDIDATES = 20;
export const MAX_CANDIDATE_TITLE_CHARACTERS = 4_000;
const RELATION_THRESHOLD = 0.9;

export type RelationCandidate = { id: string; title: string };
type ChoiceClient = { choose(request: ChoiceRequest): Promise<ChoiceResult> };
type ParentKind = 'project' | 'vision';

export type JevClassification = {
	kind: ClassifiedKind;
	typeProbability: number;
	relationId: string | null;
	relationProbability: number | null;
	model: string;
	cost?: number;
};

const TYPE_CRITERIA = {
	task: 'Une action exécutable et finie, même sans date ni projet.',
	project: 'Un résultat concret et terminable, qui peut demander plusieurs actions.',
	vision: 'Une direction durable ou un état souhaité, sans fin précise.'
};

export async function decideCapture(
	rawContent: string,
	client: ChoiceClient,
	loadCandidates: (kind: ParentKind) => Promise<RelationCandidate[]>
): Promise<JevClassification> {
	const typeDecision = await client.choose({
		state: rawContent,
		instructions: 'Quel type représente le mieux cette capture personnelle ?',
		criteria: TYPE_CRITERIA
	});
	const kind = typeDecision.choice as ClassifiedKind;
	const result: JevClassification = {
		kind,
		typeProbability: typeDecision.probabilities[kind],
		relationId: null,
		relationProbability: null,
		model: typeDecision.model,
		cost: typeDecision.cost
	};
	if (kind === 'vision') return result;

	const candidates = await loadCandidates(kind === 'task' ? 'project' : 'vision');
	if (
		!candidates.length ||
		candidates.length > MAX_RELATION_CANDIDATES ||
		candidates.some((candidate) => !candidate.title.trim()) ||
		candidates.reduce((length, candidate) => length + candidate.title.length, 0) >
			MAX_CANDIDATE_TITLE_CHARACTERS
	) {
		return result;
	}

	const criteria: Record<string, string> = { none: 'Aucun rattachement pertinent.' };
	for (const candidate of candidates) criteria[candidate.id] = candidate.title;
	const relationDecision = await client.choose({
		state: rawContent,
		instructions:
			kind === 'task'
				? 'Cette Task appartient-elle clairement à un des Projects existants ?'
				: 'Ce Project appartient-il clairement à une des Visions existantes ?',
		criteria
	});
	const chosen = relationDecision.choice;
	const probability = relationDecision.probabilities[chosen];
	result.relationProbability = probability;
	if (
		chosen !== 'none' &&
		probability >= RELATION_THRESHOLD &&
		probability > relationDecision.probabilities.none
	) {
		result.relationId = chosen;
	}
	if (relationDecision.cost !== undefined) result.cost = (result.cost ?? 0) + relationDecision.cost;
	return result;
}
