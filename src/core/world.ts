import type { GameMap } from '../map/GameMap.ts';
import type { AudioEngine } from '../audio/AudioEngine.ts';
import type { Faction, Vec2 } from './types.ts';
import type { Unit } from '../entities/Unit.ts';
import type { Building } from '../entities/Building.ts';
export interface ProjectileSpec {
	kind: 'bullet' | 'rocket';
	from: Vec2;
	target: Entity | Vec2;
	damage: number;
	splash: number;
	faction: Faction;
}
// Anything that lives in the world and can be targeted.
export interface Entity {
	id: number;
	kind: 'unit' | 'building';
	faction: Faction;
	pos: Vec2;
	hp: number;
	maxHp: number;
	dead: boolean;
	// collision/selection radius in world px
	radius: number;
	sight: number; // tiles
}
// Services the simulation exposes to entities, projectiles and AI.
export interface World {
	map: GameMap;
	audio: AudioEngine;
	time: number;
	units: Unit[];
	buildings: Building[];
	rng(): number;
	spawnProjectile(spec: ProjectileSpec): void;
	spawnExplosion(pos: Vec2, radius: number, big: boolean): void;
	spawnMuzzle(pos: Vec2): void;
	// Applies damage at a point to all enemies of `faction` within `radius` px.
	damageArea(pos: Vec2, radius: number, damage: number, faction: Faction): void;
	findNearestEnemy(faction: Faction, pos: Vec2, rangeTiles: number): Entity | null;
	creditsFor(faction: Faction): number;
	addCredits(faction: Faction, amount: number): void;
}
