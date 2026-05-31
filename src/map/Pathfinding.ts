import type { GameMap } from './GameMap.ts';
import type { Vec2 } from '../core/types.ts';

interface Node {
	x: number;
	y: number;
	g: number;
	f: number;
	parent: Node | null;
}

// Binary min-heap keyed on f.
class MinHeap {
	private items: Node[] = [];
	get size(): number {
		return this.items.length;
	}
	push(n: Node): void {
		const a = this.items;
		a.push(n);
		let i = a.length - 1;
		while (i > 0) {
			const p = (i - 1) >> 1;
			if (a[p].f <= a[i].f) break;
			[a[p], a[i]] = [a[i], a[p]];
			i = p;
		}
	}
	pop(): Node {
		const a = this.items;
		const top = a[0];
		const last = a.pop()!;
		if (a.length > 0) {
			a[0] = last;
			let i = 0;
			const n = a.length;
			for (;;) {
				const l = 2 * i + 1;
				const r = 2 * i + 2;
				let s = i;
				if (l < n && a[l].f < a[s].f) s = l;
				if (r < n && a[r].f < a[s].f) s = r;
				if (s === i) break;
				[a[s], a[i]] = [a[i], a[s]];
				i = s;
			}
		}
		return top;
	}
}

const DIRS = [
	[1, 0],
	[-1, 0],
	[0, 1],
	[0, -1],
	[1, 1],
	[1, -1],
	[-1, 1],
	[-1, -1],
];

/**
 * A* on the tile grid. Returns a list of tile coordinates from start to goal
 * (excluding start). If goal is blocked, routes to the nearest reachable tile.
 */
export function findPath(map: GameMap, start: Vec2, goal: Vec2, maxIterations = 6000): Vec2[] {
	const sx = start.x;
	const sy = start.y;
	let gx = goal.x;
	let gy = goal.y;

	if (sx === gx && sy === gy) return [];

	// If the goal tile is impassable, find the closest passable neighbour.
	if (!map.passable(gx, gy)) {
		let best: Vec2 | null = null;
		let bestD = Infinity;
		for (let r = 1; r <= 6 && !best; r++) {
			for (let dy = -r; dy <= r; dy++) {
				for (let dx = -r; dx <= r; dx++) {
					const nx = gx + dx;
					const ny = gy + dy;
					if (!map.passable(nx, ny)) continue;
					const d = (nx - sx) ** 2 + (ny - sy) ** 2;
					if (d < bestD) {
						bestD = d;
						best = { x: nx, y: ny };
					}
				}
			}
		}
		if (!best) return [];
		gx = best.x;
		gy = best.y;
	}

	const heuristic = (x: number, y: number): number => {
		const dx = Math.abs(x - gx);
		const dy = Math.abs(y - gy);
		// octile distance
		return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
	};

	const open = new MinHeap();
	const startNode: Node = {
		x: sx,
		y: sy,
		g: 0,
		f: heuristic(sx, sy),
		parent: null,
	};
	open.push(startNode);

	const gScore = new Map<number, number>();
	const closed = new Set<number>();
	const key = (x: number, y: number): number => y * map.w + x;
	gScore.set(key(sx, sy), 0);

	let iter = 0;
	let bestNode = startNode;
	let bestH = startNode.f;

	while (open.size > 0 && iter < maxIterations) {
		iter++;
		const cur = open.pop();
		const ck = key(cur.x, cur.y);
		if (closed.has(ck)) continue;
		closed.add(ck);

		if (cur.x === gx && cur.y === gy) return reconstruct(cur);

		const h = heuristic(cur.x, cur.y);
		if (h < bestH) {
			bestH = h;
			bestNode = cur;
		}

		for (const [dx, dy] of DIRS) {
			const nx = cur.x + dx;
			const ny = cur.y + dy;
			if (!map.passable(nx, ny)) continue;
			// prevent cutting diagonal corners
			if (dx !== 0 && dy !== 0) {
				if (!map.passable(cur.x + dx, cur.y) || !map.passable(cur.x, cur.y + dy)) continue;
			}
			const nk = key(nx, ny);
			if (closed.has(nk)) continue;
			const step = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1;
			const tentative = cur.g + step;
			const prev = gScore.get(nk);
			if (prev !== undefined && tentative >= prev) continue;
			gScore.set(nk, tentative);
			open.push({
				x: nx,
				y: ny,
				g: tentative,
				f: tentative + heuristic(nx, ny),
				parent: cur,
			});
		}
	}

	// No full path; head toward the closest node we found.
	if (bestNode !== startNode) return reconstruct(bestNode);
	return [];
}

function reconstruct(node: Node): Vec2[] {
	const path: Vec2[] = [];
	let cur: Node | null = node;
	while (cur && cur.parent) {
		path.push({ x: cur.x, y: cur.y });
		cur = cur.parent;
	}
	path.reverse();
	return path;
}
