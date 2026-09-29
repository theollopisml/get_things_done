import { Temporal } from '@js-temporal/polyfill';
import { z } from 'zod';

const interval = z.number().int().min(1).max(365);
export const recurrenceRuleSchema = z.discriminatedUnion('frequency', [
	z.object({ frequency: z.literal('daily'), interval }),
	z
		.object({
			frequency: z.literal('weekly'),
			interval,
			weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7)
		})
		.refine((rule) => new Set(rule.weekdays).size === rule.weekdays.length),
	z.object({ frequency: z.literal('monthly'), interval, day: z.number().int().min(1).max(31) })
]);
export type RecurrenceRule = z.infer<typeof recurrenceRuleSchema>;

export function recurrenceLabel(rule: RecurrenceRule) {
	if (rule.frequency === 'daily')
		return rule.interval === 1 ? 'Tous les jours' : `Tous les ${rule.interval} jours`;
	if (rule.frequency === 'monthly')
		return rule.interval === 1
			? `Le ${rule.day} de chaque mois`
			: `Le ${rule.day} tous les ${rule.interval} mois`;
	const days = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
	return `${rule.interval === 1 ? 'Chaque semaine' : `Toutes les ${rule.interval} semaines`} · ${rule.weekdays.map((day) => days[day - 1]).join(', ')}`;
}

function plain(date: string) {
	return Temporal.PlainDate.from(date);
}

export function matchesRecurrenceDate(rule: RecurrenceRule, anchorDate: string, date: string) {
	const anchor = plain(anchorDate);
	const candidate = plain(date);
	if (Temporal.PlainDate.compare(candidate, anchor) < 0) return false;
	if (rule.frequency === 'daily') {
		return anchor.until(candidate, { largestUnit: 'days' }).days % rule.interval === 0;
	}
	if (rule.frequency === 'weekly') {
		const anchorWeek = anchor.subtract({ days: anchor.dayOfWeek - 1 });
		const candidateWeek = candidate.subtract({ days: candidate.dayOfWeek - 1 });
		const weeks = anchorWeek.until(candidateWeek, { largestUnit: 'days' }).days / 7;
		return weeks % rule.interval === 0 && rule.weekdays.includes(candidate.dayOfWeek);
	}
	const months = (candidate.year - anchor.year) * 12 + candidate.month - anchor.month;
	return (
		months % rule.interval === 0 && candidate.day === Math.min(rule.day, candidate.daysInMonth)
	);
}

export function getNextRecurrenceDate({
	rule,
	anchorDate,
	currentScheduledDate,
	completionDate
}: {
	rule: RecurrenceRule;
	anchorDate: string;
	currentScheduledDate: string;
	completionDate: string;
}) {
	const current = plain(currentScheduledDate);
	const completed = plain(completionDate);
	return getFirstRecurrenceDateAfter(
		rule,
		anchorDate,
		Temporal.PlainDate.compare(current, completed) > 0 ? current.toString() : completed.toString()
	);
}

export function getFirstRecurrenceDateAfter(
	rule: RecurrenceRule,
	anchorDate: string,
	afterDate: string
) {
	const anchor = plain(anchorDate);
	let candidate = plain(afterDate).add({ days: 1 });
	if (Temporal.PlainDate.compare(candidate, anchor) < 0) candidate = anchor;
	if (rule.frequency === 'daily') {
		const days = anchor.until(candidate, { largestUnit: 'days' }).days;
		return anchor.add({ days: Math.ceil(days / rule.interval) * rule.interval }).toString();
	}
	if (rule.frequency === 'monthly') {
		const months = Math.max(
			0,
			(candidate.year - anchor.year) * 12 + candidate.month - anchor.month
		);
		let month = anchor
			.with({ day: 1 })
			.add({ months: Math.floor(months / rule.interval) * rule.interval });
		for (let attempt = 0; attempt < 2; attempt++) {
			const match = month.with({ day: Math.min(rule.day, month.daysInMonth) });
			if (Temporal.PlainDate.compare(match, candidate) >= 0) return match.toString();
			month = month.add({ months: rule.interval });
		}
	}
	for (let day = 0; day < rule.interval * 7 + 7; day++) {
		if (matchesRecurrenceDate(rule, anchorDate, candidate.toString())) return candidate.toString();
		candidate = candidate.add({ days: 1 });
	}
	throw new Error('No next recurrence date found');
}
