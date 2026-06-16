// Shared constants and core type definitions for the game.
export const TILE = 32; // world pixels per tile
export const MAP_W = 64; // tiles
export const MAP_H = 64; // tiles
export type Faction = 'player' | 'enemy';
// The three shades used to render a faction's units and buildings.
export interface FactionPalette {
	primary: string;
	dark: string;
	light: string;
}
export interface Vec2 {
	x: number;
	y: number;
}
export type TerrainKind = 'grass' | 'dirt' | 'rock' | 'water';
export type UnitTypeId = 'harvester' | 'infantry' | 'rocketeer' | 'lighttank' | 'heavytank';
export type BuildingTypeId =
	| 'yard' // Construction Yard (HQ)
	| 'power' // Power Plant
	| 'refinery' // Refinery
	| 'barracks' // Infantry
	| 'factory' // War Factory (vehicles)
	| 'turret'; // Defensive turret
/**
 * Why an entity left the world. Drives the removal side-effects (visual
 * effect, sound, freeing of tiles) and lets stats count only what matters
 * (e.g. only `'destroyed'` entities are kills). Extend this union to add new
 * removal kinds; each new value just needs a branch in the removal handler.
 */
export type RemovalCause = 'destroyed' | 'sold';
/** A weapon as a data-driven capability. Its presence on a def means the
 * entity can shoot; its absence (harvester, power plant) means it cannot. */
export interface WeaponSpec {
	damage: number;
	range: number; // tiles
	cooldown: number; // seconds between shots
	projectile: 'bullet' | 'rocket';
	splash?: number; // tiles AoE radius
}
export interface UnitDef {
	id: UnitTypeId;
	cost: number;
	buildTime: number; // seconds
	hp: number;
	speed: number; // tiles / second
	sight: number; // tiles
	radius: number; // collision radius in world px
	// combat capability; absent => unarmed (e.g. harvester)
	weapon?: WeaponSpec;
	// which production building trains it
	from: BuildingTypeId;
	// tech requirement: building that must exist
	requires?: BuildingTypeId;
	isHarvester?: boolean;
}
export interface BuildingDef {
	id: BuildingTypeId;
	cost: number;
	buildTime: number;
	hp: number;
	w: number; // tiles
	h: number; // tiles
	sight: number;
	power: number; // positive = produces, negative = consumes
	// combat capability; absent => passive structure
	weapon?: WeaponSpec;
	requires?: BuildingTypeId[];
}
