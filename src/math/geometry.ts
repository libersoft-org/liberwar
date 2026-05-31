import type { Vec2 } from '../core/types.ts';

/**
 * Walks tiles outward from a centre in concentric rings and returns the first
 * one satisfying `accept`. Replaces the four near-identical spiral searches
 * that previously lived in Game and AI.
 */
export function spiralSearch(cx: number, cy: number, accept: (tx: number, ty: number) => boolean, opts: { minR?: number; maxR?: number; steps?: number } = {}): Vec2 | null {
	const minR = opts.minR ?? 1;
	const maxR = opts.maxR ?? 12;
	const steps = opts.steps ?? 16;
	for (let r = minR; r < maxR; r++) {
		for (let a = 0; a < steps; a++) {
			const ang = (a / steps) * Math.PI * 2;
			const tx = Math.round(cx + Math.cos(ang) * r);
			const ty = Math.round(cy + Math.sin(ang) * r);
			if (accept(tx, ty)) return { x: tx, y: ty };
		}
	}
	return null;
}

/**
 * Returns the item closest to `pos` (across one or more groups) that passes
 * `accept` and lies within `maxDist` world px, or null. Iterates the groups in
 * place — no intermediate array — so it stays allocation-free on hot paths.
 */
export function nearest<T extends { pos: Vec2 }>(pos: Vec2, accept: (item: T) => boolean, maxDist: number, groups: Iterable<T>[]): T | null {
	let best: T | null = null;
	let bestD = Number.isFinite(maxDist) ? maxDist * maxDist : Infinity;
	for (const group of groups) {
		for (const it of group) {
			if (!accept(it)) continue;
			const dx = it.pos.x - pos.x;
			const dy = it.pos.y - pos.y;
			const d = dx * dx + dy * dy;
			if (d < bestD) {
				bestD = d;
				best = it;
			}
		}
	}
	return best;
}
