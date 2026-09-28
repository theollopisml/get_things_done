import { describe, expect, it, vi } from 'vitest';
import {
	decideCapture,
	MAX_CANDIDATE_TITLE_CHARACTERS,
	MAX_RELATION_CANDIDATES
} from './classification';
import type { ChoiceResult } from './client';

function decision(choice: string, probabilities: Record<string, number>): ChoiceResult {
	return { choice, probabilities, confidence: 0.95, model: 'typesafe/jev-1.13', cost: 0.01 };
}

const project = { id: 'project-1', title: 'Refaire mon portfolio' };
const vision = { id: 'vision-1', title: 'Développer ma créativité' };

describe('Jev capture decisions', () => {
	it('applies a valid type even when its probability is low', async () => {
		const client = {
			choose: vi.fn(async () => decision('vision', { task: 0.4, project: 0.35, vision: 0.25 }))
		};
		const loadCandidates = vi.fn(async () => []);
		expect(await decideCapture('Dessiner plus souvent', client, loadCandidates)).toMatchObject({
			kind: 'vision',
			typeProbability: 0.25,
			relationId: null
		});
		expect(client.choose).toHaveBeenCalledOnce();
		expect(loadCandidates).not.toHaveBeenCalled();
	});

	it('attaches a Task only to a confident eligible Project', async () => {
		const client = {
			choose: vi
				.fn()
				.mockResolvedValueOnce(decision('task', { task: 0.7, project: 0.2, vision: 0.1 }))
				.mockResolvedValueOnce(decision(project.id, { none: 0.04, [project.id]: 0.96 }))
		};
		const loadCandidates = vi.fn(async () => [project]);
		const result = await decideCapture('Corriger le CSS du portfolio', client, loadCandidates);
		expect(loadCandidates).toHaveBeenCalledWith('project');
		expect(client.choose.mock.calls[1][0]).toMatchObject({
			state: 'Corriger le CSS du portfolio',
			criteria: { none: expect.any(String), [project.id]: project.title }
		});
		expect(result).toMatchObject({
			kind: 'task',
			typeProbability: 0.7,
			relationId: project.id,
			relationProbability: 0.96,
			cost: 0.02
		});
	});

	it('offers only Visions to a Project and leaves uncertain relations empty', async () => {
		const client = {
			choose: vi
				.fn()
				.mockResolvedValueOnce(decision('project', { task: 0.1, project: 0.8, vision: 0.1 }))
				.mockResolvedValueOnce(decision(vision.id, { none: 0.11, [vision.id]: 0.89 }))
		};
		const loadCandidates = vi.fn(async () => [vision]);
		const result = await decideCapture('Publier mes dessins', client, loadCandidates);
		expect(loadCandidates).toHaveBeenCalledWith('vision');
		expect(result.relationId).toBeNull();
		expect(result.relationProbability).toBe(0.89);
	});

	it('skips relation choice when the candidate list is empty or exceeds the limit', async () => {
		for (const candidates of [
			[],
			Array.from({ length: MAX_RELATION_CANDIDATES + 1 }, (_, index) => ({
				id: `project-${index}`,
				title: `Project ${index}`
			}))
		]) {
			const client = {
				choose: vi.fn(async () => decision('task', { task: 0.9, project: 0.08, vision: 0.02 }))
			};
			const result = await decideCapture('Faire une tâche', client, async () => candidates);
			expect(result.relationId).toBeNull();
			expect(client.choose).toHaveBeenCalledOnce();
		}
	});

	it('does not attach when Jev selects none', async () => {
		const client = {
			choose: vi
				.fn()
				.mockResolvedValueOnce(decision('task', { task: 1, project: 0, vision: 0 }))
				.mockResolvedValueOnce(decision('none', { none: 0.95, [project.id]: 0.05 }))
		};
		const result = await decideCapture('Tâche autonome', client, async () => [project]);
		expect(result.relationId).toBeNull();
		expect(result.relationProbability).toBe(0.95);
	});

	it('skips a relation question when candidate titles cannot be presented safely', async () => {
		const client = {
			choose: vi.fn(async () => decision('task', { task: 0.9, project: 0.08, vision: 0.02 }))
		};
		const result = await decideCapture('Faire une tâche', client, async () => [
			{ id: project.id, title: 'A'.repeat(MAX_CANDIDATE_TITLE_CHARACTERS + 1) }
		]);
		expect(result.relationId).toBeNull();
		expect(client.choose).toHaveBeenCalledOnce();
	});
});
