import type { Faction, Vec2 } from '../core/types.ts';
import type { Entity } from '../core/world.ts';

/**
 * Shared base for everything that exists in the world, can be damaged and
 * destroyed. Unit and Building extend this, eliminating the duplicated
 * hp/dead/takeDamage boilerplate.
 */
export abstract class GameObject implements Entity {
	abstract readonly kind: 'unit' | 'building';
	id: number;
	faction: Faction;
	pos: Vec2;
	hp: number;
	maxHp: number;
	radius: number;
	sight: number;
	dead = false;
	// internal flag used by the simulation to run death effects exactly once
	_deathHandled = false;

	constructor(id: number, faction: Faction, pos: Vec2, maxHp: number, radius: number, sight: number) {
		this.id = id;
		this.faction = faction;
		this.pos = { ...pos };
		this.maxHp = maxHp;
		this.hp = maxHp;
		this.radius = radius;
		this.sight = sight;
	}

	takeDamage(dmg: number): void {
		this.hp -= Math.round(dmg);
		if (this.hp <= 0) {
			this.hp = 0;
			this.dead = true;
		}
	}
}
