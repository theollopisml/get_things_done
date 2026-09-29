export const visionStatuses = ['active', 'paused', 'archived'] as const;
export type VisionStatus = (typeof visionStatuses)[number];

const transitions: Record<VisionStatus, readonly VisionStatus[]> = {
	active: ['paused', 'archived'],
	paused: ['active', 'archived'],
	archived: ['active']
};

export function canChangeVisionStatus(current: VisionStatus, next: VisionStatus) {
	return transitions[current].includes(next);
}
