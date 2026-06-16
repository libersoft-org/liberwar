import type { Vec2 } from '../core/types.ts';

// Constrains `value` to the inclusive range [min, max].
export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

// Euclidean distance between two points.
export function dist(a: Vec2, b: Vec2): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

// Angle (radians) of the vector pointing from `from` to `to`.
export function angleTo(from: Vec2, to: Vec2): number {
	return Math.atan2(to.y - from.y, to.x - from.x);
}
