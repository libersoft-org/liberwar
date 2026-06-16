import type { Faction, RemovalCause, Vec2 } from '../core/types.ts';
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
	// Why this entity was removed, or null while it is still alive. The single
	// source of truth for removal; `dead` is derived from it.
	removalCause: RemovalCause | null = null;
	// internal flag used by the simulation to run removal effects exactly once
	_removalHandled = false;

	constructor(id: number, faction: Faction, pos: Vec2, maxHp: number, radius: number, sight: number) {
		this.id = id;
		this.faction = faction;
		this.pos = { ...pos };
		this.maxHp = maxHp;
		this.hp = maxHp;
		this.radius = radius;
		this.sight = sight;
	}

	get dead(): boolean {
		return this.removalCause !== null;
	}

	// Schedules this entity for removal. The first cause wins, so a unit that is
	// already destroyed cannot later be "sold" and vice versa.
	remove(cause: RemovalCause): void {
		if (this.removalCause === null) this.removalCause = cause;
	}

	takeDamage(dmg: number): void {
		if (dmg <= 0) return;
		// Any positive hit removes at least 1 hp. Rounding alone dropped splash
		// damage below 0.5 (edge of a blast after falloff) to zero, so distant
		// targets soaked explosions for free.
		this.hp -= Math.max(1, Math.round(dmg));
		if (this.hp <= 0) {
			this.hp = 0;
			this.remove('destroyed');
		}
	}
}
