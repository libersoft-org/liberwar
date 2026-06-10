import { spiralSearch } from '../math/geometry.ts';
import { tileCenter } from '../map/GameMap.ts';
import { TILE } from '../core/types.ts';
import { dist } from '../math/vec.ts';
import { FOG_HIDDEN, FOG_VISIBLE } from '../map/FogOfWar.ts';
import type { FogOfWar } from '../map/FogOfWar.ts';
import type { GameMap } from '../map/GameMap.ts';
import type { BuildingTypeId, Vec2 } from '../core/types.ts';
import type { Building } from '../entities/Building.ts';

/**
 * Pure spatial queries about where buildings/units can be placed. Holds no
 * mutable state of its own; reads the map and the live buildings list.
 */
export class PlacementSystem {
	private map: GameMap;
	private buildings: () => Building[];
	private fog: FogOfWar;

	constructor(map: GameMap, buildings: () => Building[], fog: FogOfWar) {
		this.map = map;
		this.buildings = buildings;
		this.fog = fog;
	}

	// True if a w×h footprint at (tx,ty) is on buildable, unoccupied ground.
	canPlaceBuilding(tx: number, ty: number, w: number, h: number): boolean {
		for (let y = ty; y < ty + h; y++) {
			for (let x = tx; x < tx + w; x++) {
				if (!this.map.inBounds(x, y)) return false;
				if (!this.map.passableTerrain(x, y)) return false;
				if (this.map.blocked[this.map.idx(x, y)]) return false;
			}
		}
		return true;
	}

	// Player placement additionally requires proximity to an existing structure.
	// Exception: a construction yard with no remaining player buildings may be
	// placed on any currently visible tile (within active sight, not just
	// previously explored fog).
	canPlayerPlace(tx: number, ty: number, w: number, h: number, type?: BuildingTypeId): boolean {
		// The whole footprint must sit on explored ground. Building into pitch-black
		// fog is not allowed, and because hidden tiles are uniformly unbuildable the
		// red ghost can't leak enemy buildings concealed in them via the blocked map.
		for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) if (this.fog.state(x, y) === FOG_HIDDEN) return false;
		if (!this.canPlaceBuilding(tx, ty, w, h)) return false;
		const playerBuildings = this.buildings().filter((b: Building): boolean => b.faction === 'player' && !b.dead);
		if (type === 'yard' && playerBuildings.length === 0) {
			for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) if (this.fog.state(x, y) !== FOG_VISIBLE) return false;
			return true;
		}
		const cx = tx + w / 2;
		const cy = ty + h / 2;
		for (const b of playerBuildings) {
			const bx = b.tile.x + b.def.w / 2;
			const by = b.tile.y + b.def.h / 2;
			if (dist({ x: cx, y: cy }, { x: bx, y: by }) <= Math.max(b.def.w, b.def.h) / 2 + 6) return true;
		}
		return false;
	}

	// Finds a random buildable 5×5 base spot within a tile rectangle.
	findBaseSpot(x0: number, y0: number, x1: number, y1: number, rng: () => number): Vec2 {
		for (let attempt = 0; attempt < 200; attempt++) {
			const tx = x0 + Math.floor(rng() * (x1 - x0));
			const ty = y0 + Math.floor(rng() * (y1 - y0));
			if (this.canPlaceBuilding(tx, ty, 5, 5)) return { x: tx, y: ty };
		}
		return { x: Math.floor((x0 + x1) / 2), y: Math.floor((y0 + y1) / 2) };
	}

	// Finds a free w×h footprint near an existing building.
	findFreeSpotNear(b: Building, w: number, h: number): Vec2 {
		const found = spiralSearch(b.tile.x, b.tile.y, (tx: number, ty: number): boolean => this.canPlaceBuilding(tx, ty, w, h), { maxR: 12 });
		return found ?? { x: b.tile.x, y: b.tile.y };
	}

	// Returns a passable world position next to a building for spawning units.
	findSpawnNear(b: Building): Vec2 {
		const cx = b.tile.x + b.def.w / 2;
		const cy = b.tile.y + b.def.h / 2;
		// start the spiral just outside the footprint (half its size)
		const half = Math.max(b.def.w, b.def.h) / 2;
		const found = spiralSearch(cx, cy, (tx: number, ty: number): boolean => this.map.passable(tx, ty), {
			minR: half + 1,
			maxR: half + 10,
			steps: 12,
		});
		return found ? tileCenter(found.x, found.y) : { x: b.pos.x, y: b.pos.y + b.def.h * TILE };
	}
}
