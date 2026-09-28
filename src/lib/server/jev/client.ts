import { env } from '$env/dynamic/private';
import { z } from 'zod';

export const JEV_MODEL = 'typesafe/jev-1.13';
const DECISIONS_URL = 'https://openrouter.ai/api/alpha/decisions';
const DEFAULT_TIMEOUT_MS = 10_000;

const probability = z.number().finite().min(0).max(1);
const responseSchema = z.object({
	model: z.string(),
	answers: z.record(
		z.string(),
		z.object({
			type: z.literal('choice'),
			choice: z.string(),
			probabilities: z.record(z.string(), probability),
			confidence: probability
		})
	),
	usage: z.object({ cost: z.number().finite().nonnegative().optional() }).optional()
});

export type ChoiceRequest = {
	state: string;
	instructions: string;
	criteria: Record<string, string>;
};

export type ChoiceResult = {
	choice: string;
	probabilities: Record<string, number>;
	confidence: number;
	model: string;
	cost?: number;
};

export type JevErrorCode = 'not_configured' | 'timeout' | 'network' | 'http' | 'invalid_response';

export class JevError extends Error {
	constructor(public readonly code: JevErrorCode) {
		super(`Jev ${code}`);
	}
}

export function createJevClient({
	apiKey,
	fetchImpl = fetch,
	timeoutMs = DEFAULT_TIMEOUT_MS
}: {
	apiKey: string | undefined;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}) {
	return {
		async choose({ state, instructions, criteria }: ChoiceRequest): Promise<ChoiceResult> {
			if (!apiKey) throw new JevError('not_configured');
			const choices = Object.keys(criteria);
			if (
				!state.trim() ||
				!instructions.trim() ||
				choices.length < 2 ||
				choices.some((key) => !key || !criteria[key]?.trim())
			) {
				throw new JevError('invalid_response');
			}

			let response: Response;
			try {
				response = await fetchImpl(DECISIONS_URL, {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${apiKey}`,
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						model: JEV_MODEL,
						state,
						questions: { decision: { type: 'choice', instructions, criteria } }
					}),
					signal: AbortSignal.timeout(timeoutMs)
				});
			} catch (error) {
				throw new JevError(
					error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
						? 'timeout'
						: 'network'
				);
			}
			if (!response.ok) throw new JevError('http');

			let body: unknown;
			try {
				body = await response.json();
			} catch {
				throw new JevError('invalid_response');
			}
			const parsed = responseSchema.safeParse(body);
			if (!parsed.success) throw new JevError('invalid_response');
			const { model, answers, usage } = parsed.data;
			const answer = answers.decision;
			if (
				(model !== JEV_MODEL && !model.startsWith(`${JEV_MODEL}-`)) ||
				!answer ||
				!choices.includes(answer.choice) ||
				choices.length !== Object.keys(answer.probabilities).length ||
				choices.some((key) => !(key in answer.probabilities))
			) {
				throw new JevError('invalid_response');
			}
			return {
				choice: answer.choice,
				probabilities: answer.probabilities,
				confidence: answer.confidence,
				model,
				cost: usage?.cost
			};
		}
	};
}

export function getJevClient() {
	return createJevClient({ apiKey: env.OPENROUTER_API_KEY });
}
