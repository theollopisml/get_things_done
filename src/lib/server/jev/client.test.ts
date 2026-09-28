import { describe, expect, it, vi } from 'vitest';
import { createJevClient, JevError, JEV_MODEL } from './client';

const request = {
	state: 'Refaire mon CV',
	instructions: 'Choisis le type de cette capture.',
	criteria: {
		task: 'Action finie à exécuter',
		project: 'Résultat concret à atteindre',
		vision: 'Direction durable'
	}
};

function validResponse() {
	return {
		model: `${JEV_MODEL}-20260917`,
		answers: {
			decision: {
				type: 'choice',
				choice: 'task',
				probabilities: { task: 0.8, project: 0.15, vision: 0.05 },
				confidence: 0.9
			}
		},
		usage: { cost: 0.00001 }
	};
}

describe('OpenRouter Jev client', () => {
	it('sends one bounded Choice request and returns validated metadata', async () => {
		const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(validResponse()));
		const result = await createJevClient({ apiKey: 'test-key', fetchImpl }).choose(request);
		expect(fetchImpl).toHaveBeenCalledOnce();
		const [url, init] = fetchImpl.mock.calls[0];
		expect(url).toBe('https://openrouter.ai/api/alpha/decisions');
		expect(init?.method).toBe('POST');
		expect(init?.headers).toEqual({
			Authorization: 'Bearer test-key',
			'Content-Type': 'application/json'
		});
		expect(JSON.parse(String(init?.body))).toEqual({
			model: JEV_MODEL,
			state: request.state,
			questions: {
				decision: {
					type: 'choice',
					instructions: request.instructions,
					criteria: request.criteria
				}
			}
		});
		expect(init?.signal).toBeInstanceOf(AbortSignal);
		expect(result).toEqual({
			choice: 'task',
			probabilities: { task: 0.8, project: 0.15, vision: 0.05 },
			confidence: 0.9,
			model: `${JEV_MODEL}-20260917`,
			cost: 0.00001
		});
	});

	it('rejects missing credentials without calling the provider', async () => {
		const fetchImpl = vi.fn<typeof fetch>();
		await expect(createJevClient({ apiKey: '', fetchImpl }).choose(request)).rejects.toMatchObject({
			code: 'not_configured'
		});
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it.each([
		['missing answer', { ...validResponse(), answers: {} }],
		[
			'unknown choice',
			{
				...validResponse(),
				answers: { decision: { ...validResponse().answers.decision, choice: 'checkpoint' } }
			}
		],
		[
			'missing probability',
			{
				...validResponse(),
				answers: {
					decision: {
						...validResponse().answers.decision,
						probabilities: { task: 0.8, project: 0.2 }
					}
				}
			}
		],
		[
			'invalid probability',
			{
				...validResponse(),
				answers: { decision: { ...validResponse().answers.decision, confidence: 1.2 } }
			}
		],
		['wrong model', { ...validResponse(), model: 'other/model' }]
	])('rejects %s', async (_name, body) => {
		const fetchImpl = vi.fn<typeof fetch>(async () => Response.json(body));
		await expect(
			createJevClient({ apiKey: 'test-key', fetchImpl }).choose(request)
		).rejects.toMatchObject({
			code: 'invalid_response'
		});
	});

	it('maps HTTP, network, and timeout failures to safe codes', async () => {
		const cases: [typeof fetch, string][] = [
			[async () => new Response(null, { status: 503 }), 'http'],
			[
				async () => {
					throw new Error('private provider detail');
				},
				'network'
			],
			[
				async () => {
					throw new DOMException('Timed out', 'TimeoutError');
				},
				'timeout'
			]
		];
		for (const [fetchImpl, code] of cases) {
			try {
				await createJevClient({ apiKey: 'test-key', fetchImpl }).choose(request);
				throw new Error('Expected JevError');
			} catch (error) {
				expect(error).toBeInstanceOf(JevError);
				expect(error).toMatchObject({ code, message: `Jev ${code}` });
			}
		}
	});
});
