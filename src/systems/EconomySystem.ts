import { STARTING_CREDITS } from '../core/config.ts';
import type { Faction } from '../core/types.ts';
import type { EntityQuery } from './EntityQuery.ts';
const LOW_POWER_BUILD_SPEED = 0.45;

// Handles credits and the power grid for both factions.
export class EconomySystem {
	private credits: Record<Faction, number> = {
		player: STARTING_CREDITS,
		enemy: STARTING_CREDITS,
	};
	// Carries the sub-credit remainder so slow per-frame income (rate * dt) is
	// not lost while the stored credit balance stays a whole number.
	private creditsFrac: Record<Faction, number> = {
		player: 0,
		enemy: 0,
	};
	private query: EntityQuery;

	constructor(query: EntityQuery) {
		this.query = query;
	}

	creditsFor(faction: Faction): number {
		return this.credits[faction];
	}

	canAfford(faction: Faction, cost: number): boolean {
		return this.credits[faction] >= cost;
	}

	addCredits(faction: Faction, amount: number): void {
		this.creditsFrac[faction] += amount;
		const whole = Math.floor(this.creditsFrac[faction]);
		this.credits[faction] += whole;
		this.creditsFrac[faction] -= whole;
	}

	spend(faction: Faction, amount: number): boolean {
		if (this.credits[faction] < amount) return false;
		this.credits[faction] -= amount;
		return true;
	}

	powerStatus(faction: Faction): { produced: number; consumed: number } {
		let produced = 0;
		let consumed = 0;
		for (const b of this.query.buildingsOf(faction)) {
			if (b.def.power > 0) produced += b.def.power;
			else consumed += -b.def.power;
		}
		return { produced, consumed };
	}

	// Production runs slower when a faction is over its power budget.
	buildSpeed(faction: Faction): number {
		const { produced, consumed } = this.powerStatus(faction);
		return consumed > produced ? LOW_POWER_BUILD_SPEED : 1;
	}
}
