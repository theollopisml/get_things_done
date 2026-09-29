export const dueShortcuts = ['today', 'thisweek', 'thismonth', 'thisyear'] as const;
export type DueShortcut = (typeof dueShortcuts)[number];
export const dueShortcutLabels: Record<DueShortcut, string> = {
	today: 'Aujourd’hui',
	thisweek: 'Cette semaine',
	thismonth: 'Ce mois',
	thisyear: 'Cette année'
};

function localDate(date: Date) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export function shortcutDueDate(shortcut: DueShortcut, now: Date) {
	const year = now.getFullYear();
	const month = now.getMonth();
	switch (shortcut) {
		case 'today':
			return localDate(now);
		case 'thisweek': {
			const daysUntilSunday = (7 - now.getDay()) % 7;
			return localDate(new Date(year, month, now.getDate() + daysUntilSunday));
		}
		case 'thismonth':
			return localDate(new Date(year, month + 1, 0));
		case 'thisyear':
			return localDate(new Date(year, 11, 31));
	}
}

export function takeDueCommand(value: string) {
	const match = /^\/(today|thisweek|thismonth|thisyear|date) /.exec(value);
	if (!match) return null;
	return {
		command: match[1] as DueShortcut | 'date',
		rest: value.slice(match[0].length)
	};
}
