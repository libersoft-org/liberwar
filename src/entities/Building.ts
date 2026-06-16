import { BUILDINGS } from '../core/config.ts';
import { TILE } from '../core/types.ts';
import type { BuildingDef, BuildingTypeId, Faction, Vec2 } from '../core/types.ts';
import type { World } from '../core/world.ts';
import { fireWeapon } from '../combat/Weapon.ts';
import { angleTo } from '../math/vec.ts';
import { GameObject } from './GameObject.ts';
let nextId = 100000;

export class Building extends GameObject {
	readonly kind = 'building' as const;
	typeId: BuildingTypeId;
	def: BuildingDef;
	// top-left tile of footprint
	tile: Vec2;
	cooldown = 0;
	turretAngle = 0;
	// rally point for produced units
	rally: Vec2 | null = null;

	constructor(typeId: BuildingTypeId, faction: Faction, tile: Vec2) {
		const def = BUILDINGS[typeId];
		const pos = {
			x: tile.x * TILE + (def.w * TILE) / 2,
			y: tile.y * TILE + (def.h * TILE) / 2,
		};
		const radius = (Math.max(def.w, def.h) * TILE) / 2;
		super(nextId++, faction, pos, def.hp, radius, def.sight);
		this.typeId = typeId;
		this.def = def;
		this.tile = { ...tile };
	}

	// Refund when sold: half the purchase price, scaled by current health.
	get sellValue(): number {
		return Math.floor((this.def.cost * 0.5 * this.hp) / this.maxHp);
	}

	update(dt: number, world: World): void {
		if (this.cooldown > 0) this.cooldown -= dt;

		// Armed structures (e.g. turret) auto-fire at the nearest enemy.
		const weapon = this.def.weapon;
		if (weapon) {
			const enemy = world.findEnemyInWeaponRange(this.faction, this.pos, weapon.range);
			if (enemy) {
				this.turretAngle = angleTo(this.pos, enemy.pos);
				if (this.cooldown <= 0) {
					this.cooldown = weapon.cooldown;
					fireWeapon(world, this, this.turretAngle, enemy, weapon, 2);
				}
			}
		}
	}
}
