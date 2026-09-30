// Loaded only with node --import by Playwright's webServer; never imported by src/.
const originalFetch = globalThis.fetch;
const attempts = new Map();
globalThis.fetch = async (input, init) => {
	const url = input instanceof Request ? input.url : String(input);
	if (url !== 'https://openrouter.ai/api/alpha/decisions') return originalFetch(input, init);
	const { state, questions, model } = JSON.parse(String(init.body));
	const criteria = questions.decision.criteria;
	if ('task' in criteria) {
		const count = (attempts.get(state) ?? 0) + 1;
		attempts.set(state, count);
		if (state.includes('[fail]') || (state.includes('[retry]') && count === 1)) {
			return new Response('{}', { status: 503 });
		}
	}
	const choice = 'task' in criteria ? (state.startsWith('Projet') ? 'project' : 'task') : 'none';
	const others = Object.keys(criteria).length - 1;
	return Response.json({
		model,
		answers: {
			decision: {
				type: 'choice',
				choice,
				probabilities: Object.fromEntries(
					Object.keys(criteria).map((key) => [key, key === choice ? 0.98 : 0.02 / others])
				),
				confidence: 0.98
			}
		}
	});
};
