import type { Faction, Vec2, WeaponSpec } from '../core/types.ts';
import type { Entity, World } from '../core/world.ts';

/** Minimal shape a weapon needs from whoever fires it. Both Unit and Building
 * satisfy this, so the helper is agnostic to which one is shooting. */
export interface Shooter {
	pos: Vec2;
	radius: number;
	faction: Faction;
}

/**
 * Emits a muzzle flash and a projectile for a single shot. This is the part
 * that was duplicated between Unit and Building; the trigger logic, aiming and
 * cooldown bookkeeping stay with each caller because they genuinely differ.
 */
export function fireWeapon(world: World, shooter: Shooter, angle: number, target: Entity | Vec2, weapon: WeaponSpec, muzzleGap = 4): void {
	world.spawnMuzzle({
		x: shooter.pos.x + Math.cos(angle) * (shooter.radius + muzzleGap),
		y: shooter.pos.y + Math.sin(angle) * (shooter.radius + muzzleGap),
	});
	world.spawnProjectile({
		kind: weapon.projectile,
		from: { x: shooter.pos.x, y: shooter.pos.y },
		target,
		damage: weapon.damage,
		splash: weapon.splash ?? 0,
		faction: shooter.faction,
	});
}
