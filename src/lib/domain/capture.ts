export type CaptureKind = 'entry' | 'task' | 'project';
export type ClassifiedKind = Exclude<CaptureKind, 'entry'>;

export function hasContent(value: string): boolean {
	return value.trim().length > 0;
}

export function splitCapture(value: string): { title: string; description: string | null } {
	const lines = value.replace(/\r\n?/g, '\n').split('\n');
	const first = lines.findIndex((line) => line.trim().length > 0);
	if (first < 0) throw new Error('Capture vide');
	return {
		title: lines[first].trim(),
		description:
			lines
				.slice(first + 1)
				.join('\n')
				.trim() || null
	};
}

export function isCaptureKind(value: unknown): value is CaptureKind {
	return value === 'entry' || value === 'task' || value === 'project';
}

export function isClassifiedKind(value: unknown): value is ClassifiedKind {
	return value === 'task' || value === 'project';
}
