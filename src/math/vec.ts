import type { Vec2 } from '../core/types.ts';

// Constrains `value` to the inclusive range [min, max].
export function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

// Euclidean distance between two points.
export function dist(a: Vec2, b: Vec2): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Squared distance — skips the square root, so use it whenever you only need
 * to compare distances (cheaper, no precision loss from the sqrt).
 */
export function dist2(a: Vec2, b: Vec2): number {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	return dx * dx + dy * dy;
}

// Angle (radians) of the vector pointing from `from` to `to`.
export function angleTo(from: Vec2, to: Vec2): number {
	return Math.atan2(to.y - from.y, to.x - from.x);
}

// Component-wise subtraction `a - b`.
export function sub(a: Vec2, b: Vec2): Vec2 {
	return { x: a.x - b.x, y: a.y - b.y };
}

// Magnitude of a vector.
export function len(v: Vec2): number {
	return Math.hypot(v.x, v.y);
}

// Unit vector in the same direction; returns a zero vector when `v` is zero.
export function normalize(v: Vec2): Vec2 {
	const l = Math.hypot(v.x, v.y);
	if (l === 0) return { x: 0, y: 0 };
	return { x: v.x / l, y: v.y / l };
}
