import type { BuildingDef, BuildingTypeId, Faction, FactionPalette, UnitDef, UnitTypeId } from './types.ts';
// Unit definitions
export const UNITS: Record<UnitTypeId, UnitDef> = {
	harvester: {
		id: 'harvester',
		cost: 800,
		buildTime: 8,
		hp: 600,
		speed: 1.6,
		sight: 4,
		radius: 13,
		from: 'factory',
		requires: 'refinery',
		isHarvester: true,
	},
	rifleman: {
		id: 'rifleman',
		cost: 100,
		buildTime: 2,
		hp: 80,
		speed: 2.2,
		sight: 5,
		radius: 7,
		weapon: { damage: 12, range: 4, cooldown: 0.45, projectile: 'bullet' },
		from: 'barracks',
	},
	rocketeer: {
		id: 'rocketeer',
		cost: 300,
		buildTime: 4,
		hp: 110,
		speed: 1.9,
		sight: 6,
		radius: 7,
		weapon: {
			damage: 45,
			range: 6,
			cooldown: 1.4,
			projectile: 'rocket',
			splash: 1.1,
		},
		from: 'barracks',
	},
	lighttank: {
		id: 'lighttank',
		cost: 600,
		buildTime: 6,
		hp: 320,
		speed: 2.4,
		sight: 6,
		radius: 13,
		weapon: {
			damage: 30,
			range: 5,
			cooldown: 0.9,
			projectile: 'bullet',
			splash: 0.6,
		},
		from: 'factory',
	},
	heavytank: {
		id: 'heavytank',
		cost: 1100,
		buildTime: 11,
		hp: 700,
		speed: 1.7,
		sight: 6,
		radius: 15,
		weapon: {
			damage: 65,
			range: 5.5,
			cooldown: 1.3,
			projectile: 'rocket',
			splash: 1.0,
		},
		from: 'factory',
		requires: 'power',
	},
};
// Building definitions
export const BUILDINGS: Record<BuildingTypeId, BuildingDef> = {
	yard: {
		id: 'yard',
		cost: 2000,
		buildTime: 8,
		hp: 1500,
		w: 3,
		h: 3,
		sight: 7,
		power: 0,
	},
	power: {
		id: 'power',
		cost: 300,
		buildTime: 5,
		hp: 500,
		w: 2,
		h: 2,
		sight: 4,
		power: 100,
		requires: ['yard'],
	},
	refinery: {
		id: 'refinery',
		cost: 1500,
		buildTime: 10,
		hp: 700,
		w: 3,
		h: 3,
		sight: 5,
		power: -40,
	},
	barracks: {
		id: 'barracks',
		cost: 400,
		buildTime: 5,
		hp: 500,
		w: 2,
		h: 2,
		sight: 4,
		power: -20,
		requires: ['yard'],
	},
	factory: {
		id: 'factory',
		cost: 2000,
		buildTime: 12,
		hp: 800,
		w: 3,
		h: 3,
		sight: 4,
		power: -50,
		requires: ['yard', 'power'],
	},
	turret: {
		id: 'turret',
		cost: 600,
		buildTime: 6,
		hp: 450,
		w: 1,
		h: 1,
		sight: 6,
		power: -30,
		weapon: { damage: 35, range: 6, cooldown: 0.8, projectile: 'bullet' },
		requires: ['yard', 'power'],
	},
};
// Order shown in the build sidebar.
export const BUILD_ORDER: BuildingTypeId[] = ['yard', 'power', 'refinery', 'barracks', 'factory', 'turret'];
export const TRAIN_ORDER: UnitTypeId[] = ['rifleman', 'rocketeer', 'harvester', 'lighttank', 'heavytank'];
export const FACTION_COLORS: Record<Faction, FactionPalette> = {
	player: { primary: '#3da5ff', dark: '#1c4f80', light: '#9fd2ff' },
	enemy: { primary: '#ff5a4d', dark: '#7a261f', light: '#ffb0a8' },
};
export const STARTING_CREDITS = 5000;
export const HARVEST_PER_TILE = 500; // credits worth in a full harvest tile
export const HARVESTER_CAPACITY = 700;
export const HARVEST_RATE = 220; // harvest value gathered per second
export const HARVEST_REGROW_RATE = 0.1; // harvest value regrown per second per original tile
export const HARVEST_MIN_WORTH = 100; // a harvester ignores tiles below this when picking a new target
