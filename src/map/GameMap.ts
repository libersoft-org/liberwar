import { MAP_H, MAP_W, TILE } from '../core/types.ts';
import { HARVEST_MIN_WORTH, HARVEST_PER_TILE, HARVEST_REGROW_RATE } from '../core/config.ts';
import type { TerrainKind, Vec2 } from '../core/types.ts';

// Seedable pseudo-random generator (mulberry32).
function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return function (): number {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// Smooth value-noise built on a coarse random grid with bilinear interpolation.
class ValueNoise {
	private grid: number[][];
	private cell: number;
	constructor(rng: () => number, cell: number) {
		this.cell = cell;
		const gw = Math.ceil(MAP_W / cell) + 2;
		const gh = Math.ceil(MAP_H / cell) + 2;
		this.grid = [];
		for (let y = 0; y < gh; y++) {
			const row: number[] = [];
			for (let x = 0; x < gw; x++) row.push(rng());
			this.grid.push(row);
		}
	}
	at(x: number, y: number): number {
		const gh = this.grid.length;
		const gw = this.grid[0]!.length;
		const gx = x / this.cell;
		const gy = y / this.cell;
		let x0 = Math.floor(gx);
		let y0 = Math.floor(gy);
		const fx = gx - x0;
		const fy = gy - y0;
		// wrap so coordinates sampled beyond the grid (e.g. variation offsets) tile seamlessly
		x0 = ((x0 % (gw - 1)) + (gw - 1)) % (gw - 1);
		y0 = ((y0 % (gh - 1)) + (gh - 1)) % (gh - 1);
		const s = (t: number): number => t * t * (3 - 2 * t); // smoothstep
		const a = this.grid[y0]![x0]!;
		const b = this.grid[y0]![x0 + 1]!;
		const c = this.grid[y0 + 1]![x0]!;
		const d = this.grid[y0 + 1]![x0 + 1]!;
		const top = a + (b - a) * s(fx);
		const bot = c + (d - c) * s(fx);
		return top + (bot - top) * s(fy);
	}
}

export class GameMap {
	readonly w = MAP_W;
	readonly h = MAP_H;
	// terrain[y][x]
	terrain: TerrainKind[][] = [];
	// remaining harvest value per tile (0 = none)
	harvest: number[][] = [];
	// original (maximum) harvest value per tile; tiles regrow back toward this
	harvestMax: number[][] = [];
	// coordinates of tiles that originally held harvest (regrowth candidates)
	private regrowTiles: Vec2[] = [];
	// true if a building blocks this tile
	blocked: Uint8Array;
	// small per-tile color variation for rendering, 0..1
	variation: number[][] = [];

	constructor(seed: number) {
		this.blocked = new Uint8Array(MAP_W * MAP_H);
		this.generate(seed);
	}

	idx(tx: number, ty: number): number {
		return ty * MAP_W + tx;
	}

	inBounds(tx: number, ty: number): boolean {
		return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H;
	}

	private generate(seed: number): void {
		const rng = mulberry32(seed);
		const land = new ValueNoise(rng, 9);
		const rough = new ValueNoise(rng, 4);
		const harvestNoise = new ValueNoise(rng, 6);

		for (let y = 0; y < MAP_H; y++) {
			this.terrain[y] = [];
			this.harvest[y] = [];
			this.harvestMax[y] = [];
			this.variation[y] = [];
			for (let x = 0; x < MAP_W; x++) {
				const elev = land.at(x, y) * 0.7 + rough.at(x, y) * 0.3;
				let kind: TerrainKind;
				if (elev < 0.28) kind = 'water';
				else if (elev < 0.36) kind = 'dirt';
				else if (elev > 0.78) kind = 'rock';
				else kind = 'grass';
				this.terrain[y]![x] = kind;
				this.variation[y]![x] = rough.at(x * 1.7 + 11, y * 1.7 + 7);
				this.harvest[y]![x] = 0;
				this.harvestMax[y]![x] = 0;
			}
		}

		// Carve a couple of harvest fields on passable ground.
		const fields = 5;
		for (let f = 0; f < fields; f++) {
			const cx = 6 + Math.floor(rng() * (MAP_W - 12));
			const cy = 6 + Math.floor(rng() * (MAP_H - 12));
			const r = 3 + Math.floor(rng() * 3);
			for (let y = cy - r - 1; y <= cy + r + 1; y++) {
				for (let x = cx - r - 1; x <= cx + r + 1; x++) {
					if (!this.inBounds(x, y)) continue;
					const d = Math.hypot(x - cx, y - cy);
					if (d > r + 1) continue;
					if (this.terrain[y]![x] === 'water' || this.terrain[y]![x] === 'rock') continue;
					const n = harvestNoise.at(x, y);
					const fall = 1 - d / (r + 1);
					const amt = Math.max(0, fall * 0.8 + n * 0.4 - 0.2);
					if (amt > 0.1) {
						// Every harvest tile holds the same full amount.
						this.harvest[y]![x] = HARVEST_PER_TILE;
						this.harvestMax[y]![x] = HARVEST_PER_TILE;
						this.regrowTiles.push({ x, y });
					}
				}
			}
		}
	}

	// Slowly regrows depleted tiles back toward their original harvest value.
	regrow(dt: number): void {
		const step = HARVEST_REGROW_RATE * dt;
		for (const t of this.regrowTiles) {
			const cur = this.harvest[t.y]![t.x]!;
			const max = this.harvestMax[t.y]![t.x]!;
			if (cur < max && !this.blocked[this.idx(t.x, t.y)]) this.harvest[t.y]![t.x] = Math.min(max, cur + step);
		}
	}

	passable(tx: number, ty: number): boolean {
		if (!this.inBounds(tx, ty)) return false;
		const t = this.terrain[ty]![tx]!;
		if (t === 'water' || t === 'rock') return false;
		if (this.blocked[this.idx(tx, ty)]) return false;
		return true;
	}

	// Passable for pathing ignoring building footprints (used for spawn/exit).
	passableTerrain(tx: number, ty: number): boolean {
		if (!this.inBounds(tx, ty)) return false;
		const t = this.terrain[ty]![tx]!;
		return t !== 'water' && t !== 'rock';
	}

	setBlocked(tx: number, ty: number, v: boolean): void {
		if (!this.inBounds(tx, ty)) return;
		this.blocked[this.idx(tx, ty)] = v ? 1 : 0;
	}

	// Guarantees a walkable route between two tiles, carving an L-shaped corridor
	// through any water/rock that isolates them. The value-noise generator can
	// split the map into islands; without this the two starting bases could be
	// mutually unreachable and the match unwinnable. Runs once at match setup.
	ensureConnected(a: Vec2, b: Vec2): void {
		if (this.terrainConnected(a, b)) return;
		const carveWide = (tx: number, ty: number): void => {
			this.clearToLand(tx, ty);
			this.clearToLand(tx + 1, ty);
			this.clearToLand(tx, ty + 1);
		};
		let x = a.x;
		let y = a.y;
		carveWide(x, y);
		while (x !== b.x) {
			x += x < b.x ? 1 : -1;
			carveWide(x, y);
		}
		while (y !== b.y) {
			y += y < b.y ? 1 : -1;
			carveWide(x, y);
		}
	}

	// Flood-fills passable terrain from `a` and reports whether `b` is reachable.
	// Uses terrain-only passability (water/rock are the permanent barriers);
	// buildings are transient and must not count toward winnability.
	private terrainConnected(a: Vec2, b: Vec2): boolean {
		if (!this.passableTerrain(a.x, a.y) || !this.passableTerrain(b.x, b.y)) return false;
		const goal = this.idx(b.x, b.y);
		const seen = new Uint8Array(MAP_W * MAP_H);
		const stack: number[] = [this.idx(a.x, a.y)];
		seen[stack[0]!] = 1;
		const dirs: ReadonlyArray<readonly [number, number]> = [
			[1, 0],
			[-1, 0],
			[0, 1],
			[0, -1],
		];
		while (stack.length > 0) {
			const cur = stack.pop()!;
			if (cur === goal) return true;
			const cx = cur % MAP_W;
			const cy = (cur / MAP_W) | 0;
			for (const [dx, dy] of dirs) {
				const nx = cx + dx;
				const ny = cy + dy;
				if (!this.passableTerrain(nx, ny)) continue;
				const ni = this.idx(nx, ny);
				if (seen[ni]) continue;
				seen[ni] = 1;
				stack.push(ni);
			}
		}
		return false;
	}

	// Turns an impassable (water/rock) tile into walkable dirt; leaves land tiles
	// and their harvest untouched (harvest only ever sits on land).
	private clearToLand(tx: number, ty: number): void {
		if (!this.inBounds(tx, ty)) return;
		const t = this.terrain[ty]![tx]!;
		if (t === 'water' || t === 'rock') this.terrain[ty]![tx] = 'dirt';
	}

	// Harvest under a building footprint is inaccessible (and reads as 0) until
	// the building is removed; the stored value stays frozen meanwhile.
	harvestAt(tx: number, ty: number): number {
		if (!this.inBounds(tx, ty)) return 0;
		if (this.blocked[this.idx(tx, ty)]) return 0;
		return this.harvest[ty]![tx]!;
	}

	// Original (maximum) harvest value of a tile.
	harvestMaxAt(tx: number, ty: number): number {
		if (!this.inBounds(tx, ty)) return 0;
		return this.harvestMax[ty]![tx]!;
	}

	// Removes up to `amount` harvest from a tile, returns actually removed value.
	takeHarvest(tx: number, ty: number, amount: number): number {
		if (!this.inBounds(tx, ty)) return 0;
		if (this.blocked[this.idx(tx, ty)]) return 0; // can't mine through a building
		const have = this.harvest[ty]![tx]!;
		const taken = Math.min(have, amount);
		this.harvest[ty]![tx] = have - taken;
		return taken;
	}

	// Finds nearest tile worth harvesting within radius (in tiles).
	findHarvest(from: Vec2, maxRadius: number = 30): Vec2 | null {
		const ftx = Math.floor(from.x / TILE);
		const fty = Math.floor(from.y / TILE);
		let best: Vec2 | null = null;
		let bestD = Infinity;
		for (let y = Math.max(0, fty - maxRadius); y < Math.min(MAP_H, fty + maxRadius); y++) {
			for (let x = Math.max(0, ftx - maxRadius); x < Math.min(MAP_W, ftx + maxRadius); x++) {
				// Ignore nearly-harvested tiles so the harvester doesn't keep returning
				// to scraps; it only targets tiles still holding a worthwhile amount.
				if (this.harvest[y]![x]! >= HARVEST_MIN_WORTH && this.passable(x, y)) {
					const d = (x - ftx) * (x - ftx) + (y - fty) * (y - fty);
					if (d < bestD) {
						bestD = d;
						best = { x, y };
					}
				}
			}
		}
		if (best) return best;
		// Nothing worthwhile nearby (e.g. the whole map is mostly depleted): fall
		// back to the richest remaining tile anywhere so harvesters keep working.
		return this.richestHarvest();
	}

	// Finds the tile with the most remaining harvest on the whole map. Honours
	// the same worth threshold as findHarvest so depleted scraps are never picked.
	private richestHarvest(): Vec2 | null {
		let best: Vec2 | null = null;
		let bestValue = 0;
		for (let y = 0; y < MAP_H; y++) {
			for (let x = 0; x < MAP_W; x++) {
				const value = this.harvest[y]![x]!;
				if (value > bestValue && value >= HARVEST_MIN_WORTH && this.passable(x, y)) {
					bestValue = value;
					best = { x, y };
				}
			}
		}
		return best;
	}
}

export function tileCenter(tx: number, ty: number): Vec2 {
	return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 };
}

export function worldToTile(p: Vec2): Vec2 {
	return { x: Math.floor(p.x / TILE), y: Math.floor(p.y / TILE) };
}
