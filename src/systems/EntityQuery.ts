import type { BuildingTypeId, Faction } from '../core/types.ts';
import type { Building } from '../entities/Building.ts';
import type { Unit } from '../entities/Unit.ts';

/**
 * Central place for the "alive entities of a faction" filters that were
 * previously duplicated across AI, Game and EconomySystem. Holds lazy getters
 * to the live lists so it always reflects the current world state.
 */
export class EntityQuery {
	private units: () => Unit[];
	private buildings: () => Building[];

	constructor(units: () => Unit[], buildings: () => Building[]) {
		this.units = units;
		this.buildings = buildings;
	}

	// Living units belonging to a faction.
	unitsOf(faction: Faction): Unit[] {
		return this.units().filter((u: Unit): boolean => !u.dead && u.faction === faction);
	}

	// Living buildings belonging to a faction.
	buildingsOf(faction: Faction): Building[] {
		return this.buildings().filter((b: Building): boolean => !b.dead && b.faction === faction);
	}

	// True if the faction owns a completed building of the given type.
	hasBuilding(faction: Faction, type: BuildingTypeId): boolean {
		return this.buildings().some((b: Building): boolean => !b.dead && b.faction === faction && b.typeId === type && b.complete);
	}

	// First living building of a type for a faction, or null.
	firstBuilding(faction: Faction, type: BuildingTypeId): Building | null {
		return this.buildings().find((b: Building): boolean => !b.dead && b.faction === faction && b.typeId === type) ?? null;
	}
}
