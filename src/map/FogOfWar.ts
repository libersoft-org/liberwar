import { MAP_H, MAP_W, TILE } from '../core/types.ts';
import type { Faction, Vec2 } from '../core/types.ts';

export const FOG_HIDDEN = 0;
export const FOG_EXPLORED = 1;
export const FOG_VISIBLE = 2;

export class FogOfWar {
	// persistent: has the tile ever been seen
	explored: Uint8Array;
	// transient: currently visible this frame
	visible: Uint8Array;
	enabled = true;

	constructor() {
		this.explored = new Uint8Array(MAP_W * MAP_H);
		this.visible = new Uint8Array(MAP_W * MAP_H);
	}

	idx(tx: number, ty: number): number {
		return ty * MAP_W + tx;
	}

	// Recompute visibility from a set of sight sources.
	update(sources: { pos: Vec2; sight: number }[]): void {
		this.visible.fill(0);
		for (const s of sources) {
			const ctx = s.pos.x / TILE;
			const cty = s.pos.y / TILE;
			const r = s.sight;
			const r2 = r * r;
			const minX = Math.max(0, Math.floor(ctx - r));
			const maxX = Math.min(MAP_W - 1, Math.ceil(ctx + r));
			const minY = Math.max(0, Math.floor(cty - r));
			const maxY = Math.min(MAP_H - 1, Math.ceil(cty + r));
			for (let y = minY; y <= maxY; y++) {
				for (let x = minX; x <= maxX; x++) {
					const dx = x + 0.5 - ctx;
					const dy = y + 0.5 - cty;
					if (dx * dx + dy * dy <= r2) {
						const i = this.idx(x, y);
						this.visible[i] = 1;
						this.explored[i] = 1;
					}
				}
			}
		}
	}

	state(tx: number, ty: number): number {
		if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return FOG_HIDDEN;
		if (!this.enabled) return FOG_VISIBLE;
		const i = this.idx(tx, ty);
		if (this.visible[i]) return FOG_VISIBLE;
		if (this.explored[i]) return FOG_EXPLORED;
		return FOG_HIDDEN;
	}

	isVisibleWorld(p: Vec2): boolean {
		if (!this.enabled) return true;
		const tx = Math.floor(p.x / TILE);
		const ty = Math.floor(p.y / TILE);
		if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false;
		return this.visible[this.idx(tx, ty)] === 1;
	}

	// True if an enemy unit at `pos` is currently concealed from the player.
	hidesUnit(faction: Faction, pos: Vec2): boolean {
		return faction === 'enemy' && !this.isVisibleWorld(pos);
	}

	// True if an enemy building on `tile` sits on unexplored ground.
	hidesBuilding(faction: Faction, tile: Vec2): boolean {
		return faction === 'enemy' && this.state(tile.x, tile.y) === FOG_HIDDEN;
	}
}
