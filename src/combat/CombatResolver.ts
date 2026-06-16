import { TILE } from '../core/types.ts';
import { nearest } from '../math/geometry.ts';
import { dist } from '../math/vec.ts';
import type { Faction, Vec2 } from '../core/types.ts';
import type { Entity } from '../core/world.ts';
import type { Unit } from '../entities/Unit.ts';
import type { Building } from '../entities/Building.ts';

// Spatial combat queries over the live unit and building lists.
export class CombatResolver {
	private units: () => Unit[];
	private buildings: () => Building[];

	constructor(units: () => Unit[], buildings: () => Building[]) {
		this.units = units;
		this.buildings = buildings;
	}

	// Nearest enemy (unit or building) of `faction` within range, or null.
	findNearestEnemy(faction: Faction, pos: Vec2, rangeTiles: number): Entity | null {
		return nearest<Entity>(pos, (e: Entity): boolean => !e.dead && e.faction !== faction, rangeTiles * TILE, [this.units(), this.buildings()]);
	}

	// Nearest enemy whose body — not just its centre — is within weapon range of
	// `pos`. Mirrors the unit firing check (range measured to the target's edge,
	// i.e. + radius) so an armed structure reaches large targets (big buildings,
	// tanks) exactly as far as a unit with the same weapon range; comparing
	// centre-to-centre alone under-reaches by the target's radius.
	findEnemyInWeaponRange(faction: Faction, pos: Vec2, rangeTiles: number): Entity | null {
		const rangePx = rangeTiles * TILE;
		let best: Entity | null = null;
		let bestD = Infinity;
		for (const group of [this.units(), this.buildings()]) {
			for (const e of group) {
				if (e.dead || e.faction === faction) continue;
				const d = dist(e.pos, pos);
				if (d > rangePx + e.radius) continue;
				if (d < bestD) {
					bestD = d;
					best = e;
				}
			}
		}
		return best;
	}

	// Applies splash damage to all enemies of `faction` within `radius` px.
	damageArea(pos: Vec2, radius: number, damage: number, faction: Faction): void {
		const targets: (Unit | Building)[] = [...this.units(), ...this.buildings()];
		for (const t of targets) {
			if (t.dead || t.faction === faction) continue;
			const d = dist(t.pos, pos);
			if (d <= radius + t.radius) {
				const fall = 1 - Math.min(1, d / (radius + t.radius)) * 0.4;
				t.takeDamage(damage * fall);
			}
		}
	}
}
